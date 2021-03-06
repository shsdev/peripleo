package ingest

import global.Global
import index.places.IndexedPlaceNetwork
import java.util.UUID
import java.util.regex.Pattern
import models.Associations
import models.core._
import models.geo._
import play.api.Logger
import play.api.db.slick._
import scala.io.Source

object CSVImporter extends AbstractImporter {
  
  private val SEPARATOR = ";"
    
  private val SPLIT_REGEX = "(?<!\\\\)" + Pattern.quote(SEPARATOR)
  
  /** Some basic CSV unescaping **/
  private def unesc(text: String) =
    text.replace("\\;", ";")
  
    
  /** Returns a tuple (PlaceNetwork, URI used in annotations, number of annotations) **/
  private def resolvePlaces(uris: Seq[String]): Seq[(IndexedPlaceNetwork, String, Int)] = {
    val allReferencedPlaces = uris.distinct
      .map(uri => (uri, Global.index.findPlaceByAnyURI(uri)))
      .filter(_._2.isDefined)
      .map(t => (t._1, t._2.get)).toMap
    
    uris.flatMap(uri => allReferencedPlaces.get(uri).map(network => (network, uri)))
      .groupBy(_._1.seedURI)
      .map(t => (t._2.head._1, t._2.head._2, t._2.size))
      .toSeq
  }

  /** Helper: for document fulltext indexing, we'll concatenate (prefix, toponym) pairs and add the final suffix **/
  private def concatText(toponymPrefixSuffix: Seq[(String, Option[String], Option[String])]): Option[String] = {
    val text = toponymPrefixSuffix.map { case (toponym, prefix, _) =>
      (prefix.getOrElse("") + " " + toponym).trim }.mkString(" ") + toponymPrefixSuffix.lastOption.getOrElse("")
        
    if (text.isEmpty)
      None
    else
      Some(text)
  }

  def importRecogitoCSV(source: Source, dataset: Dataset)(implicit s: Session) = {
    val data = source.getLines.toSeq
    val meta = toMap(data.takeWhile(_.startsWith("#")))  
    
    val header = data.drop(meta.size).take(1).toSeq.head.split(SEPARATOR, -1).toSeq
    
    // Mandatory columns
    val uuidIdx = header.indexOf("uuid")
    val uriIdx = header.indexOf("gazetteer_uri")
    val toponymIdx = header.indexOf("toponym")
    
    // Optional columns (with a little shorthand function)
    def getOptIdx(key: String): Option[Int] = header.indexOf(key) match {
      case -1 => None
      case i => Some(i)
    }
      
    val fulltextPrefixIdx = getOptIdx("fulltext_prefix")
    val fulltextSuffixIdx = getOptIdx("fulltext_suffix")

    val annotations = data.drop(meta.size + 1).map(_.split(SPLIT_REGEX, -1)).map(fields => {
      val uuid = if (uuidIdx > -1) UUID.fromString(fields(uuidIdx)) else UUID.randomUUID 
      val gazetteerURI = fields(uriIdx)
      val toponym = fields(toponymIdx)
      
      val fulltextPrefix = fulltextPrefixIdx.map(idx => unesc(fields(idx)))
      val fulltextSuffix = fulltextSuffixIdx.map(idx => unesc(fields(idx)))
      
      // In case annotations are on the root thing, the document part is an empty string!
      val documentPart = fields(header.indexOf("document_part")) 
      (uuid, documentPart, gazetteerURI, toponym, fulltextPrefix, fulltextSuffix)     
    }).groupBy(_._2)

    val annotationsOnRoot = annotations.filter(_._1.isEmpty).toSeq.flatMap(_._2.map(t => (t._1, t._3, t._4, t._5, t._6)))
    val annotationsForParts = annotations.filter(!_._1.isEmpty)
    
    val fulltextOnRoot = concatText(annotationsOnRoot.map(t => (t._3, t._4, t._5)))
    val fulltextForParts = annotationsForParts.mapValues(values => concatText(values.map(t => (t._4, t._5, t._6))))
    
    val ingestBatch = {
      // Root thing
      val rootTitle = meta.get("author").map(_ + ": ").getOrElse("") + meta.get("title").get + meta.get("language").map(" (" + _ + ")").getOrElse("")
      val rootThingId = sha256(dataset.id + " " + meta.get("author").getOrElse("") + rootTitle + " " + meta.get("language").getOrElse(""))
      val date = meta.get("date (numeric)").map(_.toInt)
      
      val partIngestBatch = annotationsForParts.map { case (partTitle, tuples) =>
        val partThingId = sha256(rootThingId + " " + partTitle)
        
        val annotationsWithText = tuples.zipWithIndex.map { case ((uuid, _, gazetteerURI, toponym, prefix, suffix), index) => 
          (Annotation(uuid, dataset.id, partThingId, gazetteerURI, Some(toponym), Some(index)), prefix, suffix) }
        
        val places = 
          resolvePlaces(annotationsWithText.map(_._1.gazetteerURI))

        val thing = 
          AnnotatedThing(partThingId, dataset.id, partTitle, None, Some(rootThingId), None, date, date, Hull.fromPlaces(places.map(_._1)))
          
        IngestRecord(thing, annotationsWithText, places, fulltextForParts.get(partTitle).flatten, Seq.empty[Image])
      }.toSeq
     
      // Root thing
      val rootAnnotationsWithText = 
        annotationsOnRoot.zipWithIndex.map { case ((uuid, gazetteerURI, toponym, prefix, suffix), index) => 
          (Annotation(uuid, dataset.id, rootThingId, gazetteerURI, Some(toponym), Some(index)), prefix, suffix) }
      
      // The places of the root thing consist of the places *directly* on the root thing and the places on all parts
      // Usually, only one list will be non-empty - but we add them, just in case
      val rootPlaces = resolvePlaces(rootAnnotationsWithText.map(_._1.gazetteerURI))
      val partPlaces = resolvePlaces(partIngestBatch.flatMap(_.annotationsWithText).map(_._1.gazetteerURI))
      val allPlaces = (rootPlaces ++ partPlaces).groupBy(_._1.seedURI).foldLeft(Seq.empty[(IndexedPlaceNetwork, String, Int)]){ case (result, (uri, list)) =>
        result :+ (list.head._1, list.head._2, list.map(_._3).sum) }
      
      val rootThing = AnnotatedThing(rootThingId, dataset.id, rootTitle, None, None, None, date, date, Hull.fromPlaces(allPlaces.map(_._1)))
      
      IngestRecord(rootThing, rootAnnotationsWithText, allPlaces, fulltextOnRoot, Seq.empty[Image]) +: partIngestBatch
    }

    // Insert data into DB
    ingest(ingestBatch, dataset)
    
    source.close()
    Logger.info("Import complete")    
  }

  private def toMap(meta: Seq[String]): Map[String, String] = {
    val properties = meta.map(comment => comment.substring(1).split(":"))
    properties.foldLeft(Seq.empty[(String, String)])((map, prop) => {
      map :+ (prop(0).trim , prop(1).trim)
    }).toMap
  }

}
