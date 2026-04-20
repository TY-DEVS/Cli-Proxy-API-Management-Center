import type { ApiCallRequest } from '@/services/api/apiCall';

export const AMAZON_Q_ENDPOINT_HOST_TEMPLATE = 'https://elasticgumbyfrontendservice.{region}.amazonaws.com';
export const AMAZON_Q_LIST_AVAILABLE_MODELS_PATH = '/ListAvailableModels';
export const AMAZON_Q_GET_USAGE_LIMITS_PATH = '/getUsageLimits';

export const AMAZON_Q_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
};

export function resolveAmazonEndpointBase(region: string): string {
  const normalizedRegion = region.trim() || 'us-east-1';
  return AMAZON_Q_ENDPOINT_HOST_TEMPLATE.replace('{region}', normalizedRegion);
}

export function buildAmazonQuotaRequestVariants(authIndex: string, region: string): Array<{
  label: string;
  request: ApiCallRequest;
}> {
  const endpointBase = resolveAmazonEndpointBase(region);

  return [
    {
      label: 'list-available-models',
      request: {
        authIndex,
        method: 'GET',
        url: `${endpointBase}${AMAZON_Q_LIST_AVAILABLE_MODELS_PATH}`,
        header: { ...AMAZON_Q_REQUEST_HEADERS },
      },
    },
    {
      label: 'list-available-models-origin',
      request: {
        authIndex,
        method: 'GET',
        url: `${endpointBase}${AMAZON_Q_LIST_AVAILABLE_MODELS_PATH}?origin=IDE`,
        header: { ...AMAZON_Q_REQUEST_HEADERS },
      },
    },
    {
      label: 'list-available-models-origin-optout-false',
      request: {
        authIndex,
        method: 'GET',
        url: `${endpointBase}${AMAZON_Q_LIST_AVAILABLE_MODELS_PATH}?origin=IDE`,
        header: {
          ...AMAZON_Q_REQUEST_HEADERS,
          'x-amzn-codewhisperer-optout': 'false',
        },
      },
    },
    {
      label: 'list-available-models-origin-external-idp',
      request: {
        authIndex,
        method: 'GET',
        url: `${endpointBase}${AMAZON_Q_LIST_AVAILABLE_MODELS_PATH}?origin=IDE`,
        header: {
          ...AMAZON_Q_REQUEST_HEADERS,
          TokenType: 'EXTERNAL_IDP',
        },
      },
    },
    {
      label: 'get-usage-limits',
      request: {
        authIndex,
        method: 'GET',
        url: `${endpointBase}${AMAZON_Q_GET_USAGE_LIMITS_PATH}`,
        header: { ...AMAZON_Q_REQUEST_HEADERS },
      },
    },
    {
      label: 'get-usage-limits-origin',
      request: {
        authIndex,
        method: 'GET',
        url: `${endpointBase}${AMAZON_Q_GET_USAGE_LIMITS_PATH}?origin=IDE`,
        header: { ...AMAZON_Q_REQUEST_HEADERS },
      },
    },
    {
      label: 'get-usage-limits-origin-optout-false',
      request: {
        authIndex,
        method: 'GET',
        url: `${endpointBase}${AMAZON_Q_GET_USAGE_LIMITS_PATH}?origin=IDE`,
        header: {
          ...AMAZON_Q_REQUEST_HEADERS,
          'x-amzn-codewhisperer-optout': 'false',
        },
      },
    },
    {
      label: 'get-usage-limits-origin-external-idp',
      request: {
        authIndex,
        method: 'GET',
        url: `${endpointBase}${AMAZON_Q_GET_USAGE_LIMITS_PATH}?origin=IDE`,
        header: {
          ...AMAZON_Q_REQUEST_HEADERS,
          TokenType: 'EXTERNAL_IDP',
        },
      },
    },
  ];
}