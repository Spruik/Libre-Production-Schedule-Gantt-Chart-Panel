'use strict';

System.register(['app/core/core'], function (_export, _context) {
  "use strict";

  var appEvents, hostname, influxHost, postgRestHost, get, post, alert, showModal, copyObject;
  function sortMax(data) {
    return data.sort(function (a, b) {
      return b.order_id - a.order_id;
    });
  }

  _export('sortMax', sortMax);

  function mergeKeyVal(arr, dimension) {
    var data = {};
    for (var i = 0; i < arr.length; i++) {
      var elem = arr[i];
      data[dimension[i]] = elem;
    }
    return data;
  }

  _export('mergeKeyVal', mergeKeyVal);

  function mergeKeyArrayVal(arr, dimension) {
    var data = [];
    for (var i = 0; i < arr.length; i++) {
      var elem = arr[i];
      var order = {};
      for (var o = 0; o < elem.length; o++) {
        var subElem = elem[o];
        order[dimension[o]] = subElem;
      }
      data.push(order);
    }
    return data;
  }

  _export('mergeKeyArrayVal', mergeKeyArrayVal);

  function findDistinct(arr) {
    return Array.from(new Set(arr));
  }

  /**
   * pass in the line, return the line's default start time
   * @param {*} line 
   */

  _export('findDistinct', findDistinct);

  function getLineStartTime(line) {
    return '6:00:00';
  }

  _export('getLineStartTime', getLineStartTime);

  return {
    setters: [function (_appCoreCore) {
      appEvents = _appCoreCore.appEvents;
    }],
    execute: function () {
      hostname = window.location.hostname;

      _export('influxHost', influxHost = 'http://' + hostname + ':8086/');

      _export('influxHost', influxHost);

      _export('postgRestHost', postgRestHost = 'http://' + hostname + ':5436/');

      _export('postgRestHost', postgRestHost);

      _export('get', get = function get(url) {
        return new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url);
          xhr.onreadystatechange = handleResponse;
          xhr.onerror = function (e) {
            return reject(e);
          };
          xhr.send();

          function handleResponse() {
            if (xhr.readyState === 4) {
              if (xhr.status === 200) {
                var res = JSON.parse(xhr.responseText);
                resolve(res);
              } else {
                reject(this.statusText);
              }
            }
          }
        });
      });

      _export('get', get);

      _export('post', post = function post(url, line) {
        return new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', url);
          xhr.onreadystatechange = handleResponse;
          xhr.onerror = function (e) {
            return reject(e);
          };
          xhr.send(line);

          function handleResponse() {
            if (xhr.readyState === 4) {
              if (xhr.status === 200) {
                // console.log('200');
                var res = JSON.parse(xhr.responseText);
                resolve(res);
              } else if (xhr.status === 204) {
                // console.log('204');
                res = xhr.responseText;
                resolve(res);
              } else {
                reject(this.statusText);
              }
            }
          }
        });
      });

      _export('post', post);

      _export('alert', alert = function alert(type, title, msg) {
        appEvents.emit('alert-' + type, [title, msg]);
      });

      _export('alert', alert);

      _export('showModal', showModal = function showModal(html, data) {
        appEvents.emit('show-modal', {
          src: 'public/plugins/smart-factory-production-schedule-gantt-chart-panel/partials/' + html,
          modalClass: 'confirm-modal',
          model: data
        });
      });

      _export('showModal', showModal);

      _export('copyObject', copyObject = function copyObject(obj) {
        var json = JSON.stringify(obj);
        return JSON.parse(json);
      });

      _export('copyObject', copyObject);
    }
  };
});
//# sourceMappingURL=utils.js.map
