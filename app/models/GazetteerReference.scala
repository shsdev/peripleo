package models

import com.vividsolutions.jts.geom.{ Coordinate, Geometry }
import org.geotools.geojson.geom.GeometryJSON
import play.api.libs.json.{ Json, JsValue }
import play.api.db.slick.Config.driver.simple._
import play.api.libs.json.JsValue

/** GazetteerReference model class.
  * 
  * Note: a gazetteer reference caches some information that normally resides in the 
  * gazetteer index. This way, we don't always have to introduce an extra index resolution
  * step when retrieving place URIs from the database.
  */
case class GazetteerReference(uri: String, title: String, geometryJson: Option[String]) {
  
  lazy val geometry: Option[Geometry] = geometryJson.map(geoJson => new GeometryJSON().read(geoJson))
  
  lazy val centroid: Option[Coordinate] = geometry.map(_.getCentroid.getCoordinate)
  
}