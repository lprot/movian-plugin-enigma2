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

var BASE_URL = "http://lubetube.com"

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

new page.Route(plugin.id + ":zapTo:(.*):(.*):(.*)", function(page, url, serviceName, serviceReference) {
    page.loading = true;
    if (service.zap)
        var doc = http.request(unescape(url) + '/web/zap?sRef=' + serviceReference);

    page.type = 'video';
    page.loading = false;
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(serviceName),
        no_fs_scan: true,
        canonicalUrl: plugin.id + ':zapTo:' + url + ':' + serviceName + ':' + serviceReference,
        sources: [{
            url: unescape(url).replace('https:', 'http:') + ':8001/' + serviceReference,
            mimetype: 'video/mp2t'
        }],
        no_subtitle_scan: true
    });
});

new page.Route(plugin.id + ":getServices:(.*):(.*):(.*)", function(page, url, serviceName, serviceReference) {
    setPageHeader(page, unescape(url) + ' - ' + trim(unescape(serviceName)));
    page.loading = true;
    var doc = http.request(unescape(url) + '/web/getservices?sRef=' + serviceReference);
    page.loading = false;
    doc = XML.parse(doc);
    try {
        var e2services = doc.e2servicelist.filterNodes('e2service');
        for (var i = 0; i < e2services.length; i++)
            page.appendItem(plugin.id + ":zapTo:" + url + ':' + escape(e2services[i].e2servicename) + ':' + encodeURIComponent(e2services[i].e2servicereference), "video", {
                title: e2services[i].e2servicename
            });
    } catch(err) {
        page.error('The list is empty');
    }
});

new page.Route(plugin.id + ":bouquets:(.*)", function(page, url) {
    setPageHeader(page, unescape(url) + ' - Bouquets');
    page.loading = true;
    var doc = http.request(unescape(url) + '/web/getservices');
    page.loading = false;
    doc = XML.parse(doc);
    var e2services = doc.e2servicelist.filterNodes('e2service');
    if (e2services.length)
        page.metadata.title += ' (' + e2services.length + ')';
    for (var i = 0; i < e2services.length; i++) {
        page.appendItem(plugin.id + ":getServices:" + url + ':' + escape(e2services[i].e2servicename) + ':' + encodeURIComponent(e2services[i].e2servicereference), "directory", {
            title: e2services[i].e2servicename
        });
    }
});

new page.Route(plugin.id + ":providers:(.*)", function(page, url) {
    setPageHeader(page, unescape(url) + ' - Providers');
    page.loading = true;
    var doc = http.request(unescape(url) + '/web/getservices?sRef=' +
        encodeURIComponent('1:7:1:0:0:0:0:0:0:0:(type == 1) || (type == 17) || (type == 195) || (type == 25) FROM PROVIDERS ORDER BY name'));
    page.loading = false;
    doc = XML.parse(doc);
    var e2services = doc.e2servicelist.filterNodes('e2service');
    if (e2services.length)
        page.metadata.title += ' (' + e2services.length + ')';
    for (var i = 0; i < e2services.length; i++) {
        page.appendItem(plugin.id + ":getServices:" + url + ':' + escape(e2services[i].e2servicename) + ':' + encodeURIComponent(e2services[i].e2servicereference), "directory", {
            title: trim(e2services[i].e2servicename)
        });
    }
});

new page.Route(plugin.id + ":all:(.*)", function(page, url) {
    setPageHeader(page, unescape(url) + ' - All services');
    page.loading = true;
    var doc = http.request(unescape(url) + '/web/getservices?sRef=' +
        encodeURIComponent('1:7:1:0:0:0:0:0:0:0:(type == 1) || (type == 17) || (type == 195) || (type == 25) ORDER BY name'));
    page.loading = false;
    doc = XML.parse(doc);
    var e2services = doc.e2servicelist.filterNodes('e2service');
    if (e2services.length)
        page.metadata.title += ' (' + e2services.length + ')';
    for (var i = 0; i < e2services.length; i++) {
        page.appendItem(plugin.id + ":zapTo:" + url + ':' + escape(e2services[i].e2servicename) + ':' + encodeURIComponent(e2services[i].e2servicereference), "video", {
            title: trim(e2services[i].e2servicename)
        });
    }
});

new page.Route(plugin.id + ":processReceiver:(.*)", function(page, url) {
    setPageHeader(page, unescape(url));

    var description = '';
    try {
        page.loading = true;
        var doc = http.request(unescape(url) + '/web/about');
        doc = XML.parse(doc);
        description = coloredStr('Current service: ', orange) + doc.e2abouts.e2about.e2servicename +
            coloredStr('\nService provider: ', orange) + doc.e2abouts.e2about.e2serviceprovider +
            coloredStr('\nReceiver model: ', orange) + doc.e2abouts.e2about.e2model +
            coloredStr('\nFirmware version: ', orange) + doc.e2abouts.e2about.e2imageversion +
            coloredStr('\nEnigma version: ', orange) + doc.e2abouts.e2about.e2enigmaversion +
            coloredStr('\nWebif version: ', orange) + doc.e2abouts.e2about.e2webifversion
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

    page.appendItem(plugin.id + ":bouquets:" + url, "directory", {
        title: 'Bouquets'
    });
    if (service.showProviders)
        page.appendItem(plugin.id + ":providers:" + url, "directory", {
            title: 'Providers'
        });

    if (service.showAllServices)
        page.appendItem(plugin.id + ":all:" + url, "directory", {
            title: 'All services'
        });
    page.loading = false;
});

function showReceivers(page) {
print(store.reveivers);
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
        page.appendItem(plugin.id + ":processReceiver:" + decodeURIComponent(receiver.link), "directory", {
            title: new RichText(decodeURIComponent(receiver.title) + coloredStr(' (' + decodeURIComponent(receiver.link) + ')', blue))
        });
    }
}

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
    showReceivers(page);
});
