package global.index

import models.{ AnnotatedThing, Dataset }
import org.apache.lucene.document.{ Document, Field, StringField, TextField }

class IndexedObject private[index] (doc: Document) {
  
  val id: String = doc.get(ObjectIndex.FIELD_ID)

  val title: String = doc.get(ObjectIndex.FIELD_TITLE)

  val description: String = doc.get(ObjectIndex.FIELD_DESCRIPTION)
  
  val objectType: ObjectType.Value = ObjectType.withName(doc.get(ObjectIndex.FIELD_OBJECT_TYPE))
  
}

object IndexedObject {
  
  def apply(dataset: Dataset) = {
    val doc = new Document()
    doc.add(new StringField(ObjectIndex.FIELD_ID, dataset.id, Field.Store.YES))
    doc.add(new TextField(ObjectIndex.FIELD_TITLE, dataset.title, Field.Store.YES))
    dataset.description.map(d => doc.add(new TextField(ObjectIndex.FIELD_DESCRIPTION, d, Field.Store.YES)))
    doc.add(new StringField(ObjectIndex.FIELD_OBJECT_TYPE, ObjectType.DATASET.toString, Field.Store.YES))
    doc
  }
  
  def apply(thing: AnnotatedThing) = {
    val doc = new Document()
    doc.add(new StringField(ObjectIndex.FIELD_ID, thing.id, Field.Store.YES))
    doc.add(new TextField(ObjectIndex.FIELD_TITLE, thing.title, Field.Store.YES))
    doc.add(new StringField(ObjectIndex.FIELD_OBJECT_TYPE, ObjectType.ANNOTATED_THING.toString, Field.Store.YES))
    doc    
  }
  
}

object ObjectType extends Enumeration {
  
  val DATASET = Value("Dataset")
  
  val ANNOTATED_THING = Value("AnnotatedThing")
  
}
