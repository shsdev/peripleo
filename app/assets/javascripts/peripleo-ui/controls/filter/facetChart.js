/** One 'facet dimension chart' block **/
define(['common/formatting', 'peripleo-ui/events/events'], function(Formatting, Events) {
  
  var FacetChart = function(parent, title, dimension, eventBroker) {
    var header = jQuery(
          '<div class="facet-header">' +
          '  <h3>' + title + '</h3>' +
          '  <span class="filter-buttons">' +
          '    <a href="#" class="btn set-filter"><span class="icon">&#xf0b0;</span> <span class="label">Set Filter</span></a>' +
          '    <a href="#" class="btn refine"><span class="icon">&#xf0b0;</span> <span class="label">Refine</span></a>' +
          '    <a href="#" class="btn clear"><span class="icon">&#xf00d;</span> <span class="label">Clear</span></a>' +
          '  </span>' +
          '</div>'),
          
        btnSetFilter = header.find('.btn.set-filter'),
        btnRefine = header.find('.btn.refine'),
        btnClear = header.find('.btn.clear'),
        
        /** Flag indicating whether this chart currently has a filter set **/
        isFilterSet = false,
          
        list = jQuery(
          '<ul class="chart ' + dimension + '"></ul>'),
          
        facets = [],
          
        /** Shorthand function for sorting facet values by count **/
        sortFacetValues = function(a,b) { return b.count - a.count },
          
        update = function(updatedFacets) {
          var maxCount = (updatedFacets.length > 0) ? updatedFacets.slice().sort(sortFacetValues)[0].count : 0;
              
          facets = updatedFacets;
          list.empty();
          
          jQuery.each(updatedFacets.slice(0, 5), function(idx, val) {
            var label = Formatting.formatFacetLabel(val.label),
                tooltip = Formatting.formatNumber(val.count) + ' Results',
                percentage = 100 * val.count / maxCount; 
                
            list.append(Formatting.createMeter(label, tooltip, percentage));
          });
        },
        
        /** Monitor if the user set or removed a filter on this dimension **/
        onSearchChanged = function(change) {
          if (change.hasOwnProperty('facetFilter')) {
            if (change.facetFilter && change.facetFilter.dimension === dimension) {
              if (change.facetFilter.values) {
                isFilterSet = true;
                btnSetFilter.hide();
                btnRefine.show();
                btnClear.show();
              } else {
                isFilterSet = false;
                btnSetFilter.show();
                btnRefine.hide();
                btnClear.hide();
              }
            }
          }
        };
    
    btnRefine.hide();
    btnClear.hide();
    
    btnSetFilter.add(btnRefine).click(function() {
      eventBroker.fireEvent(Events.EDIT_FILTER_SETTINGS, { dimension: dimension, facets: facets });
      return false;
    });    
    
    btnClear.click(function() {
      eventBroker.fireEvent(Events.SEARCH_CHANGED, { facetFilter: { dimension: dimension } });
      return false;
    });
    
    parent.append(header);
    parent.append(list);
    
    eventBroker.addHandler(Events.SEARCH_CHANGED, onSearchChanged);
    
    this.update = update;
  };
  
  return FacetChart;
  
});