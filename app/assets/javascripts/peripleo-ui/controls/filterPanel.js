/** One 'facet dimension chart' block **/
define(['peripleo-ui/events/events', 
        'peripleo-ui/controls/filter/timeHistogram',
        'peripleo-ui/controls/filter/facetChart',
        'peripleo-ui/controls/filter/filterEditor'], function(Events, TimeHistogram, FacetChart, FilterEditor) {
          
  var SLIDE_DURATION = 120;
  
  var FilterPanel = function(container, eventBroker) {
        /** Slide-able body section **/
    var body = jQuery(
          '<div class="body">' +
          '  <div class="section histogram"></div>' +
          '  <div class="section facet type"></div>' +
          '  <div class="section facet source"></div>' +
          '</div>'),
        
        /** Footer (remains visible when panel slides in) **/
        footer = jQuery(
          '<div class="footer">' +
          '  <span class="list-all"><span class="icon">&#xf03a;</span> <span class="label">List all results</span></span>' +
          '  <span class="total">&nbsp;</span>' +
          '  <span class="advanced">Filters</span>' +
          '</div>'),
        
        /** DOM element shorthands **/
        histogramSection = body.find('.section.histogram'),
        typeFacetSection = body.find('.section.facet.type'),
        sourceFacetSection = body.find('.section.facet.source'),
        footerTotals = footer.find('.total'),
        buttonListAll = footer.find('.list-all'),
        buttonToggleFilters = footer.find('.advanced'),
        
        /** Sub-components - to be initialized after body added to DOM **/
        timeHistogram,
        typeFacetChart,
        sourceFacetChart,
        
        /** Filter editor **/
        filterEditor = filterEditor = new FilterEditor(eventBroker),
        
        /** Slides the panel in or out **/
        togglePanel = function() {
          var visible = body.is(':visible');
          
          if (visible)
            eventBroker.fireEvent(Events.HIDE_FILTERS);
          else
            eventBroker.fireEvent(Events.SHOW_FILTERS);
          
          body.slideToggle({ 
            duration: SLIDE_DURATION, 
            
            step: function() { eventBroker.fireEvent(Events.CONTROLS_ANIMATION); },
            
            complete: function() {
              if (visible)
                buttonToggleFilters.removeClass('open');
              else
                buttonToggleFilters.addClass('open');
              
              eventBroker.fireEvent(Events.CONTROLS_ANIMATION_END);
            }
          });
        },
        
        /** Refreshes the charts **/
        refresh = function(response) {      
          var facets = response.facets, 
              typeDimension = jQuery.grep(facets, function(facet) { return facet.dimension === 'type'; }),
              typeFacets = (typeDimension.length > 0) ? typeDimension[0].top_children : [],
          
              sourceDim = jQuery.grep(facets, function(facet) { return facet.dimension === 'source_dataset'; });
              sourceFacets = (sourceDim.length > 0) ? sourceDim[0].top_children : [];
           
          footerTotals.html('(' + numeral(response.total).format('0,0') + ')');
          
          typeFacetChart.update(typeFacets);
          sourceFacetChart.update(sourceFacets);
        };
        
    /** Instantiate child controls **/
    body.hide();
    container.append(body);
    container.append(footer);
    
    timeHistogram = new TimeHistogram(histogramSection, eventBroker);
    typeFacetChart = new FacetChart(typeFacetSection, 'Type', 'type', eventBroker);
    sourceFacetChart = new FacetChart(sourceFacetSection, 'Source', 'source_dataset', eventBroker);
    
    buttonToggleFilters.click(togglePanel);
    buttonListAll.click(function() { eventBroker.fireEvent(Events.TOGGLE_ALL_RESULTS); });

    // Forward updates to the facet charts
    eventBroker.addHandler(Events.API_INITIAL_RESPONSE, refresh);
    eventBroker.addHandler(Events.API_VIEW_UPDATE, refresh);
  };
  
  return FilterPanel;
    
});
