/** A wrapper around the API functions required by the map search UI **/
define(['peripleo-ui/events/events'], function(Events) {

      /** A throttle for allowing max. one query every QUERY_DELAY_MS milliseconds **/
  var QUERY_DELAY_MS = 100,

      /** Number of top places to fetch on every request **/
      TOP_PLACES_MIN = 20,

      /** Number of top places to fetch on 'large' requests, i.e. when there's a query phrase or while exploring **/
      TOP_PLACES_MAX = 600,

      /** Number of search results to fetch **/
      SEARCH_RESULT_LIMIT = 20,

      /** Enum for search states **/
      SearchState = { SEARCH : 1, SUB_SEARCH : 2 };

  var API = function(eventBroker) {

        /** Current search parameter state **/
    var searchParams = {

          query: false,

          object_types: false,

          exclude_object_types: false,

          datasets: false,

          exclude_datasets: false,

          gazetteers: false,

          exclude_gazetteers: false,

          lang: false,

          exclude_lang: false,

          from: false,

          to: false,

          bbox: false,

          places: false

        },

        /** Flag indicating whether we're currently in 'serch' or 'subsearch' state **/
        currentSearchState = SearchState.SEARCH,

        /** Flag indicating whether we're currently in exploration mode **/
        explorationMode = false,

        /** Flag indicating whether the user wants simplified geometry **/
        bboxMode = false,

        /** Caches the query before exploration mode, in case user returns without changed query **/
        queryBeforeExplorationMode = false,

        /** Flag indicating whether time histogram should be included **/
        includeTimeHistogram = false,

        /** Flag indicating whether 2D facet heatmap should be included **/
        includeHeatmap = false,

        /** Indicates whether we're currenly waiting for an API response **/
        busy = false,

        /** Indicating whether the user has already issued a new search/view update request while busy **/
        pendingSearch = false,
        pendingViewUpdate = false,

        /** The last search parameter change **/
        lastDiff = false,

        /** Builds the query URL for a new search **/
        buildFirstPageQueryURL = function(opt_params, opt_searchState) {
          var params = (opt_params) ? opt_params : searchParams,
              searchState = (opt_searchState) ? opt_searchState : currentSearchState,

              // Unlike subsequent 'next page' requests, the first request include facets
              url = buildBaseQueryURL(params, searchState, includeTimeHistogram) + '&facets=true';

          // Fetch top places if there's a query or we're in exploration mode
          if (params.query || explorationMode)
            url += '&top_places=' + TOP_PLACES_MAX;
          else
            // Note: in this case we only need the top places for the thumbnails
            url += '&top_places=' + TOP_PLACES_MIN;

          return url;
        },

        /** Builds the query URL for subsequent search pages **/
        buildNextPageQueryURL = function(offset) {
          var url = buildBaseQueryURL(searchParams, currentSearchState, false);
          url += '&offset=' + offset;
          return url;
        },

        /** Builds the URL query string **/
        buildBaseQueryURL = function(params, searchState, withTimeHistogram) {
          var url = '/peripleo/search?limit=' + SEARCH_RESULT_LIMIT;

          if (!bboxMode)
            url += '&verbose=true';

          if (withTimeHistogram)
            url += '&time_histogram=true';

          if (includeHeatmap)
            url += '&heatmap=true';

          // TODO this has grown... DRY. Express more concisely, based on fields of params dict directly!

          if (params.query)
            url += '&query=' + params.query;

          if (params.object_types)
            url += '&types=' + params.object_types;

          if (params.exclude_object_types)
            url += '&exclude_types=' + params.exclude_object_types;

          if (params.datasets)
            url += '&datasets=' + params.datasets;

          if (params.exclude_datasets)
            url += '&exclude_datasets=' + params.exclude_datasets;

          if (params.gazetteers)
            url += '&gazetteers=' + params.gazetteers;

          if (params.exclude_gazetteers)
            url += '&exclude_gazetteers=' + params.exclude_gazetteers;

          if (params.lang)
            url += '&lang=' + params.lang;

          if (params.exclude_lang)
            url += '&exclude_lang' + params.exclude_lang;

          if (params.from)
            url += '&from=' + params.from;

          if (params.to)
            url += '&to=' + params.to;

          if (searchState === SearchState.SUB_SEARCH)
            url += '&places=' + jQuery.map(params.places, function(uri) { return encodeURIComponent(uri); }).join(',');
          else if (params.bbox)
            url += '&bbox=' +
              params.bbox.west + ',' + params.bbox.east + ',' +
              params.bbox.south + ',' + params.bbox.north;

          return url;
        },

        /** Waits for QUERY_DELAY_MS and handles the pending request, if any **/
        handlePending = function() {
          setTimeout(function() {
            if (pendingSearch)
              makeSearchRequest();
            else if (pendingViewUpdate) // Note: search always include view updates, too
              makeViewUpdateRequest();
            else
              busy = false;

            pendingSearch = false;
            pendingViewUpdate = false;
          }, QUERY_DELAY_MS);
        },

        /** Fires an initial load request **/
        initialLoad = function() {
          busy = true;

          jQuery.getJSON(buildFirstPageQueryURL(), function(response) {
            eventBroker.fireEvent(Events.API_INITIAL_RESPONSE, response);
          }).always(handlePending);
        },

        /** Fires a search request against the API **/
        makeSearchRequest = function() {
          var params = jQuery.extend({}, searchParams), // Params at time of query
              state = currentSearchState; // Search state at time of query
              diff = lastDiff; // Keep most recent diff at time of query

          busy = true;

          jQuery.getJSON(buildFirstPageQueryURL(), function(response) {
            response.params = params;
            response.diff = diff;
            response.exploration_mode = explorationMode;

            if (state === SearchState.SEARCH) {
              eventBroker.fireEvent(Events.API_SEARCH_RESPONSE, response);
              eventBroker.fireEvent(Events.API_VIEW_UPDATE, response);
            } else {
              eventBroker.fireEvent(Events.API_SUB_SEARCH_RESPONSE, response);
              makeViewUpdateRequest(); // In sub-search state, view-updates are different, so we want an extra request
            }
          }).always(handlePending);
        },

        /** Helper: either fires a search request, or schedules for later if busy **/
        search = function() {
          if (busy)
            pendingSearch = true;
          else
            makeSearchRequest();
        },

        loadNextPage = function(offset) {
          jQuery.getJSON(buildNextPageQueryURL(offset), function(response) {
            eventBroker.fireEvent(Events.API_NEXT_PAGE, response);
          });
        },

        /** Fires a search request against the API to accomodate a view update **/
        makeViewUpdateRequest = function() {
          var params = jQuery.extend({}, searchParams);
          busy = true;

          // View updates ignore the state, and are always forced to 'search'
          jQuery.getJSON(buildFirstPageQueryURL(undefined, SearchState.SEARCH), function(response) {
            response.params = params;
            response.exploration_mode = explorationMode;
            eventBroker.fireEvent(Events.API_VIEW_UPDATE, response);
          }).always(handlePending);
        },

        /** Helper: either fires a view update request, or schedules for later if busy **/
        updateView = function() {
          if (busy)
            pendingViewUpdate = true;
          else
            makeViewUpdateRequest();
        },

        /** Changes the search state to 'subsearch' **/
        toStateSubSearch = function(subsearch) {
          currentSearchState = SearchState.SUB_SEARCH;
          searchParams.places = jQuery.map(subsearch.places, function(p) { return p.identifier; });
          if (subsearch.clear_query)
            searchParams.query = false;

          search();
        },

        /** Changes the search state to 'search' **/
        toStateSearch = function() {
          currentSearchState = SearchState.SEARCH;
          searchParams.places = false;
        },

        /**
         * Fires a one-time search request. The one-time search uses the current global
         * search parameter settings, plus a set of changes. The request is fired to the API
         * immediately.
         *
         * The one-time search is similar to the sub-search. However, the result is not
         * communicated via the global event pool. Instead, the response is ONLY passed back
         * to a callback function provided in the parameters.
         *
         * @param the changes to the current global search parameters, and the callback function
         */
        makeOneTimeSearchRequest = function(params) {
          var mergedParams = jQuery.extend({}, searchParams, params);

          // One-time searches ignore the state, and are always forced to 'sub-search'
          jQuery.getJSON(buildFirstPageQueryURL(mergedParams, SearchState.SUB_SEARCH), function(response) {
            response.params = mergedParams;
            delete response.params.callback; // Clean up the params object, i.e. remove the callback fn reference
            params.callback(response);
          });
        };

    /** Run an initial view update on load **/
    eventBroker.addHandler(Events.LOAD, function(initialSettings) {
      jQuery.extend(searchParams, initialSettings); // Incorporate inital settings
      initialLoad();
    });

    eventBroker.addHandler(Events.SEARCH_CHANGED, function(diff) {
      // jQuery.extend(searchParams, diffNormalized); // Update search params
      jQuery.extend(searchParams, diff);
      // lastDiff = diffNormalized; // Store as last diff
      lastDiff = diff;

      // SPECIAL: if the user added a query and we're not exploring, ignore geo-bounds
      if (diff.query && !explorationMode)
        searchParams.bbox = false;

      search();
    });

    eventBroker.addHandler(Events.VIEW_CHANGED, function(bounds) {
      searchParams.bbox = bounds;
      updateView();
    });

    eventBroker.addHandler(Events.LOAD_NEXT_PAGE, loadNextPage);
    eventBroker.addHandler(Events.ONE_TIME_SEARCH, makeOneTimeSearchRequest);
    eventBroker.addHandler(Events.TO_STATE_SUB_SEARCH, toStateSubSearch);
    eventBroker.addHandler(Events.TO_STATE_SEARCH, toStateSearch);

    eventBroker.addHandler(Events.START_EXPLORATION, function() {
      queryBeforeExplorationMode = searchParams.query;
      searchParams.query = false;
      explorationMode = true;
      search();
    });

    eventBroker.addHandler(Events.STOP_EXPLORATION, function() {
      // If the user didn't define a new query in exploration, we restore
      if (!searchParams.query)
        searchParams.query = queryBeforeExplorationMode;

      queryBeforeExplorationMode = false;
      explorationMode = false;
      search();
    });

    // If the filter panel is closed, we don't request the time histogram (it's expensive!)
    eventBroker.addHandler(Events.SHOW_FILTERS, function() {
      includeTimeHistogram = true;

      // Filter elements will ignore view updates while in sub-search
      if (currentSearchState === SearchState.SEARCH)
        updateView();
      else
        search();
    });

    eventBroker.addHandler(Events.HIDE_FILTERS, function() {
      includeTimeHistogram = false;
    });

    eventBroker.addHandler(Events.TOGGLE_BBOX_MODE, function(enabled) {
      bboxMode = enabled;
    });

    eventBroker.addHandler(Events.TOGGLE_HEATMAP, function(params) {
      includeHeatmap = params.enabled;
      makeViewUpdateRequest();
    });

  };

  return API;

});
