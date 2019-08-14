import { appEvents } from 'app/core/core'

const hostname = window.location.hostname
export const influxHost = 'http://' + hostname + ':8086/'
export const postgRestHost = 'http://' + hostname + ':5436/'

let _prodLineDetails

export const get = url => {
  return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest()
      xhr.open('GET', url)
      xhr.onreadystatechange = handleResponse
      xhr.onerror = e => reject(e)
      xhr.send()

      function handleResponse () {
      if (xhr.readyState === 4) {
          if (xhr.status === 200) {
          var res = JSON.parse(xhr.responseText)
          resolve(res)
          } else {
          reject(this.statusText)
          }
      }
      }
  })
}

export const post = (url, line) => {
  return new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.onreadystatechange = handleResponse
    xhr.onerror = e => reject(e)
    xhr.send(line)

    function handleResponse () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          // console.log('200');
          var res = JSON.parse(xhr.responseText)
          resolve(res)
        } else if (xhr.status === 204) {
          // console.log('204');
          res = xhr.responseText
          resolve(res)
        } else {
          reject(this.statusText)
        }
      }
    }
  })
}

export const alert = (type, title, msg) => {
  appEvents.emit('alert-' + type, [title, msg])
}

export const showModal = (html, data) => {
  appEvents.emit('show-modal', {
    src: 'public/plugins/smart-factory-production-schedule-gantt-chart-panel/partials/' + html,
    modalClass: 'confirm-modal',
    model: data
  })
}

export function sortMax(data){
  return data.sort((a, b) => b.order_id - a.order_id)
}

export const copyObject = obj => {
  const json = JSON.stringify(obj)
  return JSON.parse(json)
}

export function mergeKeyVal(arr, dimension){
  let data = {}
  for (let i = 0; i < arr.length; i++) {
    const elem = arr[i];
    data[dimension[i]] = elem
  }
  return data
}

export function mergeKeyArrayVal(arr, dimension){
  let data = []
  for (let i = 0; i < arr.length; i++) {
    const elem = arr[i];
    let order = {}
    for (let o = 0; o < elem.length; o++) {
      const subElem = elem[o];
      order[dimension[o]] = subElem
    }
    data.push(order)
  }
  return data
}

export function findDistinct(arr){
  return Array.from(new Set(arr))
}

/**
 * pass in the line, return the line's default start time
 * @param {*} line 
 */
export function getLineStartTime(line){
  const l = line.split(' | ')
  const target = _prodLineDetails.filter(line => line.site === l[0] && line.area === l[1] && line.production_line === l[2])
  if (target.length === 0) {
    return '6:00:00'
  }else {
    if (target[0].start_time) {
      return target[0].start_time
    }else {
      return '6:00:00'
    }
  }
}

/**
 * It sends query to postgres db to get production line details and then
 * set the results global in this utils file for further uses.
 * Then execute the callback funtion when finished.
 */
export function queryProductionLineDetails(callback){
  const url = postgRestHost + 'equipment?site=not.is.null&area=not.is.null&production_line=not.is.null&equipment=is.null'
  get(url).then(res => {
    _prodLineDetails = res
    callback()
  }).catch(e => {
    alert('error', 'Error', 'An error has occurred due to ' + e + ', please refresh the page and try again')
  })
}

export function highlightColor(hexColor){
  const rgb = hexToRgb(hexColor)
  rgb.r >= 235 ? rgb.r = 255 : rgb.r += 20
  rgb.g >= 235 ? rgb.g = 255 : rgb.g += 20
  rgb.b >= 235 ? rgb.b = 255 : rgb.b += 20
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

function rgbToHex(r, g, b){
  return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
}

function hexToRgb(hex) {
  let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function(m, r, g, b) {
      return r + r + g + g + b + b;
  });

  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
  } : null;
}

function componentToHex(c){
  let hex = c.toString(16)
  return hex.length === 1 ? "0" + hex : hex;
}

export const sure = promise => 
  promise
  .then(data => ({ok: true, data}))
  .catch(error => Promise.resolve({ok: false, error}));



