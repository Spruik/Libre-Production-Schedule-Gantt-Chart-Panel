'use strict';

System.register(['./datalist'], function (_export, _context) {
  "use strict";

  var DataList;

  /**
   * Expect the product list and production line list data
   * Passed these two data passed in to form the datalist
   * Create datalist object to control the instant search input
   * @param {*} products 
   * @param {*} productionLines 
   */
  function enableInstantSearch(products, productionLines) {

    console.log(products);

    if (productionLines) {
      console.log(productionLines);

      productionLines = productionLines.filter(function (data) {
        return data.production_line !== null && data.equipment === null;
      });

      var productionLineData = productionLines.reduce(function (arr, line) {
        var obj = { value: line, text: line.site + ' | ' + line.area + ' | ' + line.production_line };
        arr.push(obj);
        return arr;
      }, []);

      var productionLineDataList = new DataList("datalist-production-line", "datalist-input-production-line", "datalist-ul-production-line", productionLineData);

      productionLineDataList.create();
      productionLineDataList.removeListeners();
      productionLineDataList.addListeners(productionLineDataList);
    }

    var productsData = products.reduce(function (arr, p) {
      var obj = { value: p, text: p.product_id + ' | ' + p.product_desc };
      arr.push(obj);
      return arr;
    }, []);

    var productsDataList = new DataList("datalist-products", "datalist-input-products", "datalist-ul-products", productsData);

    productsDataList.create();
    productsDataList.removeListeners();
    productsDataList.addListeners(productsDataList);
  }

  _export('enableInstantSearch', enableInstantSearch);

  return {
    setters: [function (_datalist) {
      DataList = _datalist.DataList;
    }],
    execute: function () {}
  };
});
//# sourceMappingURL=instant_search_ctrl.js.map
