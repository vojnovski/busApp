// DEPENDENCIES
// ============
var express = require("express"),
    http = require("http"),
    jade = require("jade"),
    port = (process.env.PORT || 8001),
    DataProvider = require('./dataprovider').DataProvider,
    server = module.exports = express(),
    request = require('request'),
    jsdom = require('jsdom').jsdom,
    async = require('async');

// SERVER CONFIGURATION
// ====================
server.configure(function () {

    server.use(express["static"](__dirname + "/../public"));

    server.use(express.errorHandler({

        dumpExceptions:true,

        showStack:true

    }));
    server.set('views', __dirname + '/views');
    server.set('view engine', 'jade');

    server.use(server.router);
});

var rootUrl = 'http://www.ceparou06.fr/';

// SERVER
// ======
getStops = function(callback) {
    DataProvider.getAllStops(function(error, stops){
      if(!error) {
        var stopsListData = [];
        for(var i = 0; i < stops.length; i++) {
            var newStop = {};
            newStop.name = stops[i].stopName;
            newStop.lat = stops[i].lat;
            newStop.lon = stops[i].lon;
            newStop.originalId = stops[i].originalId;
            newStop.logicalId = stops[i].logicalId;
            newStop.operatorId = stops[i].operatorId;
            stopsListData.push(newStop);
        }
        callback(stops);
      }
    });
};

getAllOrderedStops = function(callback) {
    DataProvider.getAllOrderedStops(function(error, stops){
      if(!error) {
        var stopsListData = {};
        for (var line in stops ) {
            stopsListData[line] = [];
            stopsline = stops[line];

            for(var i = 0; i < stopsline.length; i++) {
                var newStop = {};
                newStop.name = stopsline[i].stopName;
                newStop.lat = stopsline[i].lat;
                newStop.lon = stopsline[i].lon;
                newStop.originalId = stopsline[i].originalId;
                newStop.logicalId = stopsline[i].logicalId;
                newStop.operatorId = stopsline[i].operatorId;
                stopsListData[line].push(newStop);
            }
        }
        callback(stopsListData);
      }
    });
};

getWebPage = function(url, callback) {
    // use a timeout value of 10 seconds
    var timeoutInMilliseconds = 10*1000;
    var opts = {
        url: url,
        timeout: timeoutInMilliseconds
    };

    request(opts, function (err, res, body) {
        if (err) {
            console.dir(err);
            return;
        } else {
            if (res.statusCode == 200) {
                callback(body);
            }
        }
    });
};

getBuses = function(depId, arrId, mainCallback) {
    DataProvider.getStop(depId, function(error, depStop) {
        DataProvider.getStop(arrId, function(error, arrStop) {
            var now = new Date();
            var url = rootUrl + 'ri/?';
            var month = now.getMonth();
            
            if(month < 10) {
                month = "0" + month;
            }

            var day = now.getDate();
            if(day < 10) {
                day = "0" + day;
            }
            
            var date = '&laDate=' + day + '%2F' + month + '%2F' + now.getFullYear() + '&lHeure=' + now.getHours() + '&laMinute=' + now.getMinutes();
            
            if(now.getHours() >= 21) {
                date = '&laDate=' + day + '%2F' + month + '%2F' + now.getFullYear() + '&lHeure=' + 08 + '&laMinute=' + 10;
            }
            
            var formatDepStop = depStop.stopName.replace(/ /g,"+").replace(/\//g, "%2F+");
            var formatArrStop = arrStop.stopName.replace(/ /g,"+").replace(/\//g, "%2F+");
            var depOptions = 'comDep=' + depStop.localityCode + '&pointDep=' + depStop.logicalId + '%24' + formatDepStop + '%242%24' + depStop.localityCode + '&numDep=';
            var arrOptions = '&comArr=' + arrStop.localityCode + '&pointArr=' + arrStop.logicalId + '%24' + formatArrStop + '%242%24' + arrStop.localityCode + '&numArr=';
            var otherOptions = '&leMeridien=&typeDate=68&critereRI=1&rub_code=4&laction=synthese&modeBus=1&modeTram=1&modeCar=1&modeTrain=1&modeBoat=1&showOptions=&selectOpt=0';

            var finalUrl = url + depOptions + arrOptions + date + otherOptions;
            console.log(finalUrl);
            async.waterfall([
                function(callback){
                    getWebPage(finalUrl, function(body) {
                        callback(null, body);
                    });
                },
                function(body, callback){
                    parseResults(body, function(results) {
                        callback(null, results);
                    });
                },
            ], function (err, result) {
               mainCallback(result);
            });
        });
    });
};

parseResults = function(body, parseCallback) {
    var window = jsdom(body).createWindow();
    var $ = require('jquery').create(window);
    var rows = $('#routesynthese tbody').children("tr");
    var results = null;
    var detailsParse = function(body, result) {
        var subWindow = jsdom(body).createWindow();
        var $ = require('jquery').create(subWindow);
        var lines = $(".lineRoute img");
        var linesAr = [];
        for(var i = 0; i < lines.length; i++) {
            linesAr.push($(lines[i]).attr("alt"));
        }
        result.line = linesAr;
        var lineTimetableLink = rootUrl + $(".lineRoute a").first().attr("href").split("../")[1];
        console.log("linedetails " + lineTimetableLink);
        results.push(result);
    };

    if($('.error').length === 0) {
        results = [];
        console.log(rows.length);
        async.each(rows, function(row, callback) {
            var result = {};
            var currElem = $(row);
            var depTime = currElem.children("td[headers='depart']").text().split("h");
            var arrTime = currElem.children("td[headers='arrivee']").text().split("h");
            result.depHour =  depTime[0] + ":" + depTime[1];
            result.arrHour = arrTime[0] + ":" + arrTime[1];
            var durationPieces = currElem.children("td[headers='duree']").first().html().split("<br />")[0].split("<abbr");
            var dur0 = durationPieces[0];
            var durSubPieces = durationPieces[1].split("</abbr>");
            var dur1 = null;
            if(durSubPieces[1] !== "") {
                dur1 = durSubPieces[1];
                result.duration = dur0 + "h" + dur1;
            } else {
                result.duration = dur0 + "min";
            }

            depDate = new Date();
            depDate.setHours(depTime[0]);
            depDate.setMinutes(depTime[1]);
            result.depDate = depDate;
            var url = rootUrl + 'ri/';
            var detlink = url + currElem.children("td[headers='details']").children("a").first().attr('href');
            getWebPage(detlink, function(body) {
                detailsParse(body, result);
                callback();
            });
            //getWebPage(detlink, detailsParse, args);
        }, function(err) {
            if (err) return next(err);
            parseCallback(results.sort(function(a,b){
                return a.depDate > b.depDate ? 1 : a.depDate < b.depDate ? -1 : 0;
            }));
        });
        
    } else {
        parseCallback(results);
    }
};

server.get('/', function(req, res) {
    getAllOrderedStops(function(results){
        return res.render('index', {stops: JSON.stringify(results)});
    });
});

server.get('/api/stops', function(req, res) {
    server.getStops(function(results) {
        return res.send(results);
    });
});

server.get('/api/search', function(req, res) {
    getBuses(req.query.depStop, req.query.arrStop, function(results) {
        console.log("returning " + (results ? results.length : 0) + " results");
        return res.send(results);
    });
});

server.get('*', function(req, res) {
    getAllOrderedStops(function(results){
        return res.render('index', {stops: JSON.stringify(results)});
    });
});


// Start Node.js Server
http.createServer(server).listen(port);

console.log('Welcome to BusApp!\n\nPlease go to http://localhost:' + port + ' to start using it');