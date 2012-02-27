ich.grabTemplates();
    
    var Map = Backbone.Model.extend({
        
        initialize : function() {
            this.myLatlng = new google.maps.LatLng(-3.71969,-38.52562);
            this.myOptions = {
              zoom: 13,
              center: this.myLatlng,
              mapTypeId: google.maps.MapTypeId.ROADMAP
            }
            
            this.map = new google.maps.Map(document.getElementById("map_canvas"), this.myOptions);
            this.setArrows=new ArrowHandler(this.map);
            this.lines=[];
            this.fetch();

            this.drawingManager = new google.maps.drawing.DrawingManager({
              drawingMode: null,
              drawingControl: true,
              drawingControlOptions: {
                position: google.maps.ControlPosition.TOP_LEFT,
                drawingModes: [google.maps.drawing.OverlayType.MARKER]
              },
              markerOptions: {
                draggable : true
              },
            });

            google.maps.event.addListener(this.drawingManager, 'markercomplete', function(marker) {
                busMap._markerList.add(marker);
            });

            this.drawingManager.setMap(this.map);
            var drawingManager=this.drawingManager;

            $(".addmarker").bind("touch click",function() {
                busMap._markerList.add(new google.maps.Marker({position: busMap.getMap().center ,
                                                                map: busMap.getMap() ,
                                                                draggable: true}));
            });

        },
        url:function() {
            //HACK because etufor data set is not consistent
            if(this.name!=undefined && this.name.length==2) {
                this.name=this.name+" -";
            }
            return "https://www.google.com/fusiontables/api/query?sql=SELECT geometry FROM 3062503 WHERE name STARTS WITH '"+this.name+"'&jsonCallback=?"
        },
        parse : function(response) {
            var setArrows=this.setArrows;
            var map=this.map;
            var lines=this.lines;
            
            //remove previous lines
            _.each(lines,function(line) {
                line.setMap(null);
            });
            
            //remove all previous arrows
            _.each(setArrows.arrows,function(arrow) {
                arrow.setMap(null);
            });
            //reinit set of arrows
            setArrows.arrows=[];
            
            //Parse response
            response.table.rows=_.flatten(response.table.rows);
            //For each coordinate, create a gmap.Latlng object, and display it
            response.table.rows=_(response.table.rows).each(function (row){
                row.coordinates=_(row.coordinates).map(function(coord) {
                    return new google.maps.LatLng(coord[1],coord[0]);
                });
                lines.push(createPoly(row.coordinates,"midline",setArrows,map));
            });
            
        },
        displayLine : function(name) {
            this.name=name;
            this.fetch();
        },
        getMap : function(){
          return this.map;
        },
    });
    
     var Marker = Backbone.Model.extend({
        initialize : function(marker) {
           var me = this;
           this.marker = marker;
           this._radius=500; //initialize radius

           this.markerOptions = {
                map: this.marker.map,
                distance: 0.5, // Starting distance in km.
                maxDistance: 2500, // Twitter has a max distance of 2500km.
                color: '#000000',
                fillColor: '#5599bb',
                fillOpacity: '0.3',
                activeColor: '#5599bb',
                sizerIcon: new google.maps.MarkerImage('img/resize-off.png'),
                activeSizerIcon: new google.maps.MarkerImage('img/resize.png')
            }

            //Attach DistanceWidgetto the marker
            this.distanceWidget=new DistanceWidget(this.marker,this.markerOptions);
            var currentDistanceWidget=this.distanceWidget;

            google.maps.event.addListener(currentDistanceWidget.radiusWidget.circle, 'active_changed', function() {
                me._radius=currentDistanceWidget.get('distance')*1000;
                console.log(me._radius+" m"); 

                console.log("Radius modified, update list");
                me.fetchLines(); 
            });

            
           google.maps.event.addListener(this.marker, 'dragend', function(mouse) {
             console.log("Drag end, update list");
             me.fetchLines();

            });

            this.fetchLines();
        },
        url:function() {
           return "https://www.google.com/fusiontables/api/query?sql=SELECT name FROM 3062503 WHERE ST_INTERSECTS(geometry,CIRCLE(LATLNG("+this.marker.getPosition().lat()+","+this.marker.getPosition().lng()+"),"+this._radius+"))&jsonCallback=?"
        },
        parse : function(response) {
          response.table.rows=_.flatten(response.table.rows);
          //we remove the last part of the 
          response.table.rows=_.map(response.table.rows,function(row) {
              var array=row.split("-");
              return array[0]+"-"+array[1];
          });
          //throw away duplicate values
          response.table.rows=_.uniq(response.table.rows);

          return response;
        },
        fetchLines:function() {
            this.fetch({
                success: function(model,response){
                  busMap._markerList.updateLineList();
                  console.log("Success updating list");
                },
                error: function() {
                  console.log("Error while updating list");
                }    
              }); 
        }
         
    });
     
    var MarkerList = Backbone.Collection.extend({
            _view : null,
            model: Marker,
            updateLineList : function() {
                this._view=new MarkerListView({model : this});
                this._view.render();
                if(this.models.length>0) {
                console.log("Rerender the lines");
                busMap._lineList._view=new LineListSelectView({model : this.computeLineList()});
                busMap._lineList._view.renderJSON();
                busMap._lineList._viewSidebar=new LineListSidebarView({model : this.computeLineList()});
                busMap._lineList._viewSidebar.renderJSON();
                }
                else {
                    busMap._lineList.reinit();
                }
                
            },
            computeLineList : function(){
                var markers_routes = this.models.map(function(mark){return mark.attributes.table.rows});
                var linesIntersection=_.intersection.apply(this,markers_routes);
                return {table: {rows: linesIntersection.map(function(row) {
                  var array=row.split("-");
                  return { num: array[0],label: array[0]+array[1]};
                })}};

            },
            toJSON : function() {
                var listMarkers=this.models;
                return {models: _.map(listMarkers,function(mark,i) {
                                return {num: i+1,index: i};
                                })};
            },
            removeByIndex : function(index) {
                var markerToRemove=this.at(index);
                this.remove(markerToRemove);
                markerToRemove.marker.setMap(null);
                markerToRemove.distanceWidget=null;
                this.updateLineList();
            }
    });
    
    var MarkerListView = Backbone.View.extend({
        el : $("#listmarkers"),
        render : function() {
            this.$el.html(ich.markerList(this.model.toJSON()));
            return this;
        }
        
    });

    var LineList = Backbone.Model.extend({
        _view : null,
        _viewSidebar
        
        initialize : function() {
            this.fetch();
            this.bind("change", function() {
                this._view=new LineListSelectView({model : this});
                this._view.render();
                this._view=new LineListSidebarView({model : this});
                this._view.render();
            });
        },
        url:function() {
            return "https://www.google.com/fusiontables/api/query?sql=SELECT name FROM 3062503&jsonCallback=?"
        },
        parse : function(response) {
            response.table.rows=_.flatten(response.table.rows);
            
            response.table.rows=_.reject(response.table.rows,function(row) {
                if(row.split("-")[2]==" Volta") {
                    return true;
                }
                else {
                    return false;
                }
            });
            
            response.table.rows=_.map(response.table.rows,function(row) {
                var array=row.split("-");
                return { num: array[0],label: array[0]+array[1]};
            });

            return response;
        },
        reinit : function() {
            this.fetch();
            this._view=new LineListSelectView({model : this});
            this._view.render();
            this._viewSidebar=new LineListSidebarView({model:this});
            this._viewSidebar.render();
        }
    });
    
    var LineListSelectView = Backbone.View.extend({
        el : $("#linelistselect"),
        render: function() {
            this.$el.html(ich.lineListSelect(this.model.toJSON()));
            $(".chzn-select").chosen({no_results_text: "No results matched"}).change(function () {
                 busMap.navigate("line/"+$(".chzn-select").val(),true);
            });
            busMap.navigate("line/"+$(".chzn-select").val(),true);
            return this;
        },
        renderJSON: function() {
            this.$el.html(ich.lineListSelect(this.model));
            $(".chzn-select").chosen({no_results_text: "No results matched"}).change(function () {
                 busMap.navigate("line/"+$(".chzn-select").val(),true);
            });
            busMap.navigate("line/"+$(".chzn-select").val(),true);
            return this;
        }
    });

    var LineListSidebarView = Backbone.View.extend({
        el : $("#linelistsidebar"),
        render: function() {
            this.$el.html(ich.lineListSidebar(this.model.toJSON()));
            $("#linelistsidebar td").live("click,touch",function () {
                 var num=$(this).attr("data-num");
                 alert(num);
                 //busMap.navigate("line/"+$(".chzn-select").val(),true);
            });
            //busMap.navigate("line/"+$(".chzn-select").val(),true);
            return this;
        },
        renderJSON: function() {
            this.$el.html(ich.lineListSidebar(this.model));
            /*
            $(".chzn-select").chosen({no_results_text: "No results matched"}).change(function () {
                 busMap.navigate("line/"+$(".chzn-select").val(),true);
            });
            busMap.navigate("line/"+$(".chzn-select").val(),true);
            */
            return this;
        }
    });
    
    var BusMap = Backbone.Router.extend({
        
        routes : {
            "":             "index",
            "line/:name":   "displayLine"
        },
        
        initialize : function() {
            this._lineList=new LineList();
            this._markerList=new MarkerList();
            this._map=new Map();
        },
        
        index : function() {
        },
        
        getMap : function(){
           return this._map.getMap();
        },

        displayLine : function(name) {
            this._map.displayLine(name);
        }
        
    });
    
    var busMap=new BusMap();
    
    Backbone.history.start();