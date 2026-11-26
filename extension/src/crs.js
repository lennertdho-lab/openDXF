// Belgian Lambert 72 (EPSG:31370), with the standard 7-parameter datum shift to WGS84.
proj4.defs('EPSG:31370',
  '+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 ' +
  '+x_0=150000.013 +y_0=5400088.438 +ellps=intl ' +
  '+towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs');

export const lngLatToL72 = ([lng, lat]) => proj4('EPSG:4326', 'EPSG:31370', [lng, lat]);
export const l72ToLngLat = ([x, y]) => proj4('EPSG:31370', 'EPSG:4326', [x, y]);
