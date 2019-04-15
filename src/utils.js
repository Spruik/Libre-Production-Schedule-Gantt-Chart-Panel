import { appEvents } from 'app/core/core'

const hostname = window.location.hostname
export const influxHost = 'http://' + hostname + ':8086/'
export const postgRestHost = 'http://' + hostname + ':5436/'

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
  return '6:00:00'
}