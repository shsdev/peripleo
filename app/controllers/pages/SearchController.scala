package controllers.pages

import controllers.AbstractController
import global.Global
import index.Heatmap
import index.objects.{ IndexedObject, IndexedObjectTypes }
import models.Page
import models.core.Datasets
import play.api.Logger
import play.api.mvc.{ Action, RequestHeader }
import play.api.libs.json.Json
import play.api.db.slick._

object SearchController extends AbstractController {
  
  private val KEY_QUERY = "q"  
  private val KEY_TYPE = "type"
  private val KEY_DATASET = "dataset"
  
  private val ITEM = "item"
  private val PLACE = "place"
  private val DATASET = "dataset"
  
  def search() = loggingAction { implicit session =>
    val query = getQueryParam(KEY_QUERY, session.request)
    val objectType = getQueryParam(KEY_TYPE, session.request).flatMap(_.toLowerCase match {
      case ITEM => Some(IndexedObjectTypes.ANNOTATED_THING)
      case PLACE => Some(IndexedObjectTypes.PLACE)
      case DATASET => Some(IndexedObjectTypes.DATASET)
      case _=> None
    })
    val dataset = getQueryParam(KEY_DATASET, session.request)
    
    // Check if there are ANY query parameters at all
    val isQueryValid = Seq(query, objectType, dataset).filter(_.isDefined).size > 0 
    if (isQueryValid) {
      val startTime = System.currentTimeMillis
      
      // Format filter conditions for UI display, resolving IDs to titles where necessary
      val filters = Seq(
        objectType.map(typ => ("type", typ.toString)),
        dataset.flatMap(datasetId => Datasets.findById(datasetId).map(dataset => ("dataset", dataset.title)))
      ).flatten.toMap
      
      // Search
      val results = Global.index.search(
        query = query,
        objectType = objectType,
        dataset = dataset)
      
      Ok(views.html.newSearch(results._1, Some(results._2), filters, results._3, System.currentTimeMillis - startTime))
    } else {
      // TODO redirect to home
      Ok(views.html.newSearch(Page.empty[(IndexedObject, Option[String])], None, Map.empty[String, String], Heatmap.empty, 0))
    }
  }
  
  def autoSuggest(query: String) = Action {
    val suggestions = { 
      val exactMatches = Global.index.suggester.suggestCompletion(query, 5)
      if (exactMatches.size > 0)
        exactMatches
      else
        Global.index.suggester.suggestSimilar(query, 5)
    }
    val asJson = suggestions.map(result => Json.obj(
      "key" -> result
    ))
    
    Ok(Json.toJson(asJson))
  }

}