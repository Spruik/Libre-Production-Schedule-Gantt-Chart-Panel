import { DataList } from './datalist';
/**
 * Expect the product list and production line list data
 * Passed these two data passed in to form the datalist
 * Create datalist object to control the instant search input
 * @param {*} products 
 * @param {*} productionLines 
 */
export function enableInstantSearch(products, productionLines) {
	if (productionLines) {
		productionLines = productionLines.filter((data) => data.production_line !== null && data.equipment === null);

		const productionLineData = productionLines.reduce((arr, line) => {
			const obj = { value: line, text: line.site + ' | ' + line.area + ' | ' + line.production_line };
			arr.push(obj);
			return arr;
		}, []);

		const productionLineDataList = new DataList(
			'datalist-production-line',
			'datalist-input-production-line',
			'datalist-ul-production-line',
			productionLineData
		);

		productionLineDataList.create();
		productionLineDataList.removeListeners();
		productionLineDataList.addListeners(productionLineDataList);
	}

	const productsData = products.reduce((arr, p) => {
		const obj = { value: p, text: p.id + ' | ' + p.product_desc };
		arr.push(obj);
		return arr;
	}, []);

	const productsDataList = new DataList(
		'datalist-products',
		'datalist-input-products',
		'datalist-ul-products',
		productsData
	);

	productsDataList.create();
	productsDataList.removeListeners();
	productsDataList.addListeners(productsDataList);
}
