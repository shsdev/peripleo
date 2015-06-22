require(['peripleo-ui/api/api',
         'peripleo-ui/controls/resultList',
         'peripleo-ui/controls/searchPanel', 
         'peripleo-ui/events/events',
         'peripleo-ui/events/eventBroker',
         'peripleo-ui/events/lifecycleWatcher',
         'peripleo-ui/map/map', 
         'peripleo-ui/urlBar'], function(API, ResultList, SearchPanel, Events, EventBroker, LifeCycleWatcher, Map, URLBar) {
  
  jQuery(document).ready(function() {  
    var container = jQuery('#controls'),
    
        eventBroker = new EventBroker(),
        
        lifeCycleWatcher = new LifeCycleWatcher(eventBroker);
        
        urlBar = new URLBar(eventBroker),
        
        api = new API(eventBroker),
        
        map = new Map(document.getElementById('map'), eventBroker),
        
        searchPanel = new SearchPanel(container, eventBroker),

        resultList = new ResultList(container, eventBroker),
        
        parseBBox = function(bboxStr) {
          var values = bboxStr.split(',');
          return { north: parseFloat(values[3]), east: parseFloat(values[1]), 
                   south: parseFloat(values[2]), west: parseFloat(values[0]) };
        },
        
        parsedURLHash = (function() {
          var hash = window.location.hash;
              keysValArray = (hash.indexOf('#') === 0) ? hash.substring(1).split('&') : false,
              keyValObject = {};
              
          if (keysValArray) {
            jQuery.each(keysValArray, function(idx, keyVal) {
              var asArray = keyVal.split('=');     
              if (asArray[0] === 'bbox') // Special handling for bbox string
                keyValObject[asArray[0]] = parseBBox(asArray[1]);
              else
                keyValObject[asArray[0]] = asArray[1];
            });
            
            // Number parsing for timespan
            if (keyValObject.from)
              keyValObject.from = parseInt(keyValObject.from);

            if (keyValObject.to)
              keyValObject.to = parseInt(keyValObject.to);
              
            return keyValObject;
          }
        })(),
        
        /** Initial settings from URL hash, or defaults if no hash **/
        initialSettings = (parsedURLHash) ? parsedURLHash : { bbox: map.getBounds() };

    // Fire 'load' event with initial settings
    eventBroker.fireEvent(Events.LOAD, initialSettings);
  });
  
});