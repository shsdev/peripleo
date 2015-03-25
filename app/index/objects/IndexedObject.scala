package index.objects

import com.spatial4j.core.context.jts.JtsSpatialContext
import index.Index
import index.IndexFields
import index.places.{ IndexedPlace, IndexedPlaceNetwork }
import models.core.{ AnnotatedThing, Dataset }
import models.geo.ConvexHull
import org.apache.lucene.document.{ Document, Field, StringField, StoredField, TextField, IntField }
import org.apache.lucene.facet.FacetField
import org.apache.lucene.spatial.prefix.RecursivePrefixTreeStrategy
import org.apache.lucene.spatial.prefix.tree.GeohashPrefixTree
import play.api.db.slick._

case class IndexedObject(private val doc: Document) {

  val objectType: IndexedObjectTypes.Value = IndexedObjectTypes.withName(doc.get(IndexFields.OBJECT_TYPE))

  val identifier: String =
    if (objectType == IndexedObjectTypes.PLACE) 
      doc.get(IndexFields.PLACE_URI) // The identifier is the first URI in the list for the place network
    else
      doc.get(IndexFields.ID) // or the ID for everything else   
      
  val title: String = doc.get(IndexFields.TITLE)
    
  val description: Option[String] = Option(doc.get(IndexFields.DESCRIPTION))
  
  val homepage: Option[String] = Option(doc.get(IndexFields.HOMEPAGE))
  
  val temporalBoundsStart: Option[Int] = Option(doc.get(IndexFields.DATE_FROM)).map(_.toInt)
  
  val temporalBoundsEnd: Option[Int] = Option(doc.get(IndexFields.DATE_TO)).map(_.toInt)
  
  val convexHull: Option[ConvexHull] = Option(doc.get(IndexFields.CONVEX_HULL)).map(ConvexHull.fromGeoJSON(_))
      
  def toPlaceNetwork = new IndexedPlaceNetwork(doc)
 
}

object IndexedObject {
  
  def toDoc(thing: AnnotatedThing, places: Seq[IndexedPlace], fulltext: Option[String], datasetHierarchy: Seq[Dataset]): Document = {
    val doc = new Document()
    
    // ID, publisher, parent dataset ID, title, description, homepage, type = AnnotatedThing
    doc.add(new StringField(IndexFields.ID, thing.id, Field.Store.YES))
    doc.add(new StringField(IndexFields.ITEM_DATASET, thing.dataset, Field.Store.YES))
    doc.add(new TextField(IndexFields.TITLE, thing.title, Field.Store.YES))
    thing.description.map(description => new TextField(IndexFields.DESCRIPTION, description, Field.Store.YES))
    thing.homepage.map(homepage => doc.add(new StoredField(IndexFields.HOMEPAGE, homepage)))
    
    doc.add(new StringField(IndexFields.OBJECT_TYPE, IndexedObjectTypes.ANNOTATED_THING.toString, Field.Store.YES))
    doc.add(new FacetField(IndexFields.OBJECT_TYPE, IndexedObjectTypes.ANNOTATED_THING.toString))
    
    // Dataset hierarchy as facet (facet field uses {label}#{id} syntax to store human-readable title plus ID at the same time
    doc.add(new FacetField(IndexFields.ITEM_DATASET, datasetHierarchy.map(d => d.title + "#" + d.id).reverse:_*))
    
    // Temporal bounds
    thing.temporalBoundsStart.map(start => doc.add(new IntField(IndexFields.DATE_FROM, start, Field.Store.YES)))
    thing.temporalBoundsEnd.map(end => doc.add(new IntField(IndexFields.DATE_TO, end, Field.Store.YES)))
    thing.temporalBoundsStart.map(start => {
      val end = thing.temporalBoundsEnd.getOrElse(start)
      val dateRange =
        if (start > end) // Minimal safety precaution... 
          Index.dateRangeTree.parseShape("[" + end + " TO " + start + "]")
        else
          Index.dateRangeTree.parseShape("[" + start + " TO " + end + "]")
          
      Index.temporalStrategy.createIndexableFields(dateRange).foreach(doc.add(_))
    })
    
    // Fulltext
    fulltext.map(text => doc.add(new TextField(IndexFields.ITEM_FULLTEXT, text, Field.Store.YES)))
    
    // Convex hull
    thing.convexHull.map(cv => doc.add(new StoredField(IndexFields.CONVEX_HULL, cv.toString)))

    // Place URIs
    places.foreach(place => doc.add(new StringField(IndexFields.ITEM_PLACES, place.uri, Field.Store.NO))) 
    
    // Detailed geometry as spatially indexed features
    val geometries = places.filter(_.geometry.isDefined).map(_.geometry.get)
    geometries.foreach(geom => Index.spatialStrategy.createIndexableFields(Index.spatialCtx.makeShape(geom)).foreach(doc.add(_)))
    
    doc   
  }
  
  def toDoc(dataset: Dataset): Document = {
    val doc = new Document()
    
    // ID, publisher, parent dataset ID, title, description, homepage, type = Dataset
    doc.add(new StringField(IndexFields.ID, dataset.id, Field.Store.YES))
    dataset.isPartOf.map(isPartOf => doc.add(new StoredField(IndexFields.IS_PART_OF, isPartOf)))
    doc.add(new TextField(IndexFields.TITLE, dataset.title, Field.Store.YES))
    dataset.description.map(d => doc.add(new TextField(IndexFields.DESCRIPTION, d, Field.Store.YES)))
    dataset.homepage.map(homepage => doc.add(new StoredField(IndexFields.HOMEPAGE, homepage)))
    doc.add(new StringField(IndexFields.OBJECT_TYPE, IndexedObjectTypes.DATASET.toString, Field.Store.YES))
    doc.add(new FacetField(IndexFields.OBJECT_TYPE, IndexedObjectTypes.DATASET.toString))
    
    // Temporal bounds    
    dataset.temporalBoundsStart.map(start => doc.add(new IntField(IndexFields.DATE_FROM, start, Field.Store.YES)))
    dataset.temporalBoundsEnd.map(end => doc.add(new IntField(IndexFields.DATE_TO, end, Field.Store.YES)))

    // Convex hull
    dataset.convexHull.map(cv => doc.add(new StoredField(IndexFields.CONVEX_HULL, cv.toString)))

    doc
  }
  
}

object IndexedObjectTypes extends Enumeration {
  
  val DATASET = Value("Dataset")
  
  val ANNOTATED_THING = Value("Item")
  
  val PLACE = Value("Place")

}

