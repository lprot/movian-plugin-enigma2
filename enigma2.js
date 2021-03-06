/*
 *  Enigma2 plugin for Movian Media Center
 *
 *  Copyright (C) 2015-2018 lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var settings = require('showtime/settings');
var http = require('showtime/http');
var popup = require('native/popup');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;
var XML = require('showtime/xml');

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function colorStr(str, color) {
    return '<font color="' + color + '"> (' + str + ')</font>';
}

function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
    page.entries = 0;
}

function trim(s) {
    if (!s || !s.toString()) return '';
    return s.replace(/^\s+|\s+$/g, '');
};

service.create(plugin.title, plugin.id + ":start", 'tv', true, logo);

settings.globalSettings(plugin.id, plugin.title, logo, plugin.synopsis);
settings.createDivider("Look & Feel");
settings.createBool("showScreenshot", "Show Screenshot", true, function(v) {
    service.showScreenshot = v;
});
settings.createBool("showProviders", "Show Providers", true, function(v) {
    service.showProviders = v;
});
settings.createBool("showAllServices", "Show All services", true, function(v) {
    service.showAllServices = v;
});
settings.createBool("zap", "Zap before channelswitch", true, function(v) {
    service.zap = v;
});

var store = require('movian/store').create('config');
if (!store.receivers) 
    store.receivers = "[]";

// Play current channel
new page.Route(plugin.id + ":streamFromCurrent:(.*)", function(page, url) {
    page.loading = true;
    var doc = http.request(unescape(url) + '/web/getcurrent');
    doc = XML.parse(doc);
    page.loading = false;
    page.type = 'video';
    page.source = "videoparams:" + JSON.stringify({
        title: doc.e2currentserviceinformation.e2service.e2servicename,
        no_fs_scan: true,
        canonicalUrl: plugin.id + ':streamFromCurrent',
        sources: [{
            url: unescape(url).replace('https:', 'http:') + ':8001/' + doc.e2currentserviceinformation.e2service.e2servicereference,
            mimetype: 'video/mp2t'
        }],
        no_subtitle_scan: true
    });
});

new page.Route(plugin.id + ":zapTo:(.*):(.*):(.*):(.*)", function(page, url, serviceName, serviceReference, title) {
    page.loading = true;
    if (service.zap)
        var doc = http.request(unescape(url) + '/web/zap?sRef=' + decodeURIComponent(serviceReference));

    page.type = 'video';
    page.loading = false;
    page.source = "videoparams:" + JSON.stringify({
        title: decodeURIComponent(serviceName),
        no_fs_scan: true,
        canonicalUrl: plugin.id + ':zapTo:' + url + ':' + serviceName + ':' + serviceReference,
        sources: [{
            url: unescape(url).replace('https:', 'http:') + ':8001/' + decodeURIComponent(serviceReference),
            mimetype: 'video/mp2t'
        }],
        no_subtitle_scan: true
    });
});

function listSatellites(page, title, param, url) {
    setPageHeader(page, unescape(title));
    page.loading = true;

    var doc = http.request(unescape(url) + '/web/getservices?sRef=' + encodeURIComponent(param));
    doc = XML.parse(doc);
    var e2services = doc.e2servicelist.filterNodes('e2service');
    for (var i = 0; i < e2services.length; i++) {
        if (e2services[i].e2servicereference.match(/flags/) || e2services[i].e2servicereference.match(/FROM PROVIDERS/))
            continue;
        var name = trim(e2services[i].e2servicereference.match(/satellitePosition == ([\s\S]*?)\)/)[1]);
        name = +name / 10 > 180 ? parseFloat(360 - name / 10).toFixed(1) + 'W' : parseFloat(name / 10).toFixed(1) + 'E'
        page.appendItem(plugin.id + ":getServices:" + url + ':' + escape(name) + ':' + encodeURIComponent(e2services[i].e2servicereference) + ':' + title, "directory", {
            title: name
        });
        page.entries++;
    }
    page.metadata.title += ' (' + page.entries + ')';
    page.loading = false;
}

new page.Route(plugin.id + ":satellitesTV:(.*):(.*)", function(page, title, url) {
    listSatellites(page, title + ' - Satellites (TV)', '1:7:1:0:0:0:0:0:0:0:(type == 1) || (type == 17) || (type == 195) || (type == 25) FROM SATELLITES ORDER BY name', url);
});

new page.Route(plugin.id + ":satellitesRadio:(.*):(.*)", function(page, title, url) {
    listSatellites(page, title + ' - Satellites (Radio)', '1:7:1:0:0:0:0:0:0:0:(type == 2) FROM SATELLITES ORDER BY name', url);
});

function callAPI(page, title, path, param, route, url) {
    setPageHeader(page, trim(unescape(title)));
    page.loading = true;
    var doc = http.request(unescape(url) + path + encodeURIComponent(param));
    doc = XML.parse(doc);
    try {
        var e2services = doc.e2servicelist.filterNodes('e2service');
        if (e2services.length)
            page.metadata.title += ' (' + e2services.length + ')';
        for (var i = 0; i < e2services.length; i++) {
            var type = e2services[i].e2servicereference.substr(0, 4);
            if (type == '4097' || type == '5001' || type == '5002') {
                var ref = e2services[i].e2servicereference.match(/[\s\S]*?:[\s\S]*?:[\s\S]*?:[\s\S]*?:[\s\S]*?:[\s\S]*?:[\s\S]*?:[\s\S]*?:[\s\S]*?:[\s\S]*?:([\s\S]*?):/);
                    page.appendItem(unescape(ref[1]).match(/m3u8/) ? 'hls:' + unescape(ref[1]) : unescape(ref[1]), "video", {
                        title: trim(e2services[i].e2servicename),
                        description: unescape(ref[1])
                    });
            } else if (e2services[i].e2servicereference.substr(0, 5) == '1:64:') 
                page.appendItem('', 'separator', {
                    title: e2services[i].e2servicename
                });
            else 
                page.appendItem(plugin.id + ':' + route + ':' + url + ':' + encodeURIComponent(e2services[i].e2servicename) + ':' + encodeURIComponent(e2services[i].e2servicereference) + ':' + title, "video", {
                    title: trim(e2services[i].e2servicename)
                });
        }
    } catch(err) {
        page.error('The list is empty');
    }
    page.loading = false;
}

new page.Route(plugin.id + ":getServices:(.*):(.*):(.*):(.*)", function(page, url, serviceName, serviceReference, title) {
    callAPI(page, title + ' - ' + decodeURIComponent(serviceName), '/web/getservices?sRef=' + serviceReference, '', 'zapTo', url);
});

new page.Route(plugin.id + ":bouquetsTV:(.*):(.*)", function(page, title, url) {
    callAPI(page, title + ' - Bouquets (TV)', '/web/getservices?sRef=', '1:7:1:0:0:0:0:0:0:0:(type == 2) FROM BOUQUET "bouquets.tv" ORDER BY bouquet', 'getServices', url);
});

new page.Route(plugin.id + ":bouquetsRadio:(.*):(.*)", function(page, title, url) {
    callAPI(page, title + ' - Bouquets (Radio)', '/web/getservices?sRef=', '1:7:1:0:0:0:0:0:0:0:(type == 1) || (type == 17) || (type == 195) || (type == 25) FROM BOUQUET "bouquets.radio" ORDER BY bouquet', 'getServices', url);
});

new page.Route(plugin.id + ":providersTV:(.*):(.*)", function(page, title, url) {
    callAPI(page, title + ' - Providers (TV)', '/web/getservices?sRef=', '1:7:1:0:0:0:0:0:0:0:(type == 1) || (type == 17) || (type == 195) || (type == 25) FROM PROVIDERS ORDER BY name', 'getServices', url);
});
new page.Route(plugin.id + ":providersRadio:(.*):(.*)", function(page, title, url) {
    callAPI(page, title + ' - Providers (TV)', '/web/getservices?sRef=', '1:7:1:0:0:0:0:0:0:0:(type == 2) FROM PROVIDERS ORDER BY name', 'getServices', url);
});

new page.Route(plugin.id + ":allTV:(.*):(.*)", function(page, title, url) {
    callAPI(page, title + ' - All TV', '/web/getservices?sRef=', '1:7:1:0:0:0:0:0:0:0:(type == 1) || (type == 17) || (type == 195) || (type == 25) ORDER BY name', 'zapTo', url);
});

new page.Route(plugin.id + ":allRadio:(.*):(.*)", function(page, title, url) {
    callAPI(page, title + ' - All Radio', '/web/getservices?sRef=', '1:7:1:0:0:0:0:0:0:0:(type == 2) ORDER BY name', 'zapTo', url);
});

new page.Route(plugin.id + ":processReceiver:(.*):(.*)", function(page, title, url) {
    setPageHeader(page, unescape(title));
    page.loading = true;

    var description = '';
    try {
        var doc = http.request(unescape(url) + '/web/about');
        doc = XML.parse(doc);
        description = coloredStr('Current service: ', orange) + doc.e2abouts.e2about.e2servicename +
            coloredStr('\nService provider: ', orange) + doc.e2abouts.e2about.e2serviceprovider +
            coloredStr('\nReceiver model: ', orange) + doc.e2abouts.e2about.e2model +
            coloredStr('\nFirmware version: ', orange) + doc.e2abouts.e2about.e2imageversion +
            coloredStr('\nEnigma version: ', orange) + doc.e2abouts.e2about.e2enigmaversion +
            coloredStr('\nWebif version: ', orange) + doc.e2abouts.e2about.e2webifversion +
            coloredStr('\nWeb page: ', orange) + unescape(url)
    } catch(err) {
        page.error(err);
        return;
    }

    page.appendItem(plugin.id + ":streamFromCurrent:" + url, "video", {
        title: 'Stream from the current service',
        icon: unescape(url) + '/grab?format=jpg&r=640',
        description: new RichText(description)
    });
    if (service.showScreenshot)
        page.appendItem(unescape(url) + '/grab?format=jpg&r=1080', "image", {
            title: 'Screenshot from the current service'
        });

    page.appendItem(plugin.id + ":bouquetsTV:" + title + ':' + url, "directory", {
        title: 'Bouquets (TV)'
    });
    page.appendItem(plugin.id + ":satellitesTV:" + title + ':' + url, "directory", {
        title: 'Satellites (TV)'
    });
    if (service.showProviders)
        page.appendItem(plugin.id + ":providersTV:" + title + ':' + url, "directory", {
            title: 'Providers (TV)'
        });
    if (service.showAllServices)
        page.appendItem(plugin.id + ":allTV:" + title + ':' + url, "directory", {
            title: 'All TV'
        });
    page.appendItem(plugin.id + ":bouquetsRadio:" + title + ':' + url, "directory", {
        title: 'Bouquets (Radio)'
    });
    page.appendItem(plugin.id + ":satellitesRadio:" + title + ':' + url, "directory", {
        title: 'Satellites (Radio)'
    });
    if (service.showProviders)
        page.appendItem(plugin.id + ":providersRadio:" + title + ':' + url, "directory", {
            title: 'Providers (Radio)'
        });
    if (service.showAllServices)
        page.appendItem(plugin.id + ":allRadio:" + title + ':' + url, "directory", {
            title: 'All Radio'
        });
    page.loading = false;
});

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.synopsis);
    page.options.createAction('addReceiver', 'Add receiver', function() {
        var result = popup.textDialog('Enter IP or DNS address of the receiver like:\n' +
            'http://192.168.0.1 or https://192.168.0.1 or http://nameOfTheReceiver or https://nameOfTheReceiver', true, true);
        if (!result.rejected && result.input) {
            var link = result.input;
            var result = popup.textDialog('Enter the name of the receiver:', true, true);
            if (!result.rejected && result.input) {
                var entry = JSON.stringify({
                    title: encodeURIComponent(result.input),
                    link: encodeURIComponent(link)
                });
                store.receivers = JSON.stringify([entry].concat(eval(store.receivers)));
                popup.notify("Receiver '" + result.input + "' has been added to the list.", 2);
                page.flush();
                page.redirect(plugin.id + ':start');
            }
        }
    });

    page.options.createAction('removeReceiver', 'Remove receiver...', function() {
        var receivers = eval(store.receivers);
        for (var i in receivers) {
            var result = popup.message("Delete receiver '" + decodeURIComponent(JSON.parse(receivers[i]).title) + "' from the list?", true, true);
            if (result) {
                popup.notify("'" + decodeURIComponent(JSON.parse(receivers[i]).title) + "' has been removed from from the list.", 2);
                receivers.splice(i, 1);
                store.receivers = JSON.stringify(receivers);
                page.flush();
                page.redirect(plugin.id + ':start');
            }
        }
    });
    
    // Show receivers
    try {
        var receivers = eval(store.receivers);
    } catch(e) {}

    if (!receivers || !receivers.toString()) {
        store.receivers = '[]'
        page.appendPassiveItem("directory", '' , {
            title: "Receiver's list is empty, you can add a receiver from the right side menu"
        });
    }

    for (var i in receivers) {
        var receiver = JSON.parse(receivers[i]);
        page.appendItem(plugin.id + ":processReceiver:" + escape(decodeURIComponent(receiver.title)) + ':' + escape(decodeURIComponent(receiver.link)), "directory", {
            title: new RichText(decodeURIComponent(receiver.title) + coloredStr(' (' + decodeURIComponent(receiver.link) + ')', blue))
        });
    }});
