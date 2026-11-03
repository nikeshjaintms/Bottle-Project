import API from '../services/api';

export const fetchPrintingPlanCalculations = async ({
  row,
  companyId,
  brandId,
  planDate,
  excludePlanIds
}) => {
  const response = await API.get('/printing-plan/stats/computed', {
    params: {
      bottleName: row.plainBottle || row.bottleName,
      brandId: brandId || undefined,
      coatingShade: row.coatingShade || '',
      companyId: (companyId?._id || companyId)?.toString(),
      planDate,
      stockSources: (row.stockSources || (companyId ? [companyId] : []))
        .map(source => (source?._id || source)?.toString()).join(','),
      orderQty: row.orderQty,
      readyQty: row.producedQty,
      boxQty: row.boxQty,
      excludePlanIds
    }
  });
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || 'Printing calculations were not returned.');
  }
  return response.data.data;
};
