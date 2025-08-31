const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const apiCanaryBlueprint = async function () {
    const API_URL = '${api_url}';
    
    const configuration = synthetics.getConfiguration();
    configuration.setConfig({
        includeRequestHeaders: true,
        includeResponseHeaders: true,
        restrictedHeaders: [],
        restrictedUrlParameters: []
    });

    let apiUrl = API_URL + '/health';
    
    const validateApiResponse = async function (res) {
        return new Promise((resolve, reject) => {
            if (res.status !== 200) {
                throw new Error(`Failed: API returned status code ${res.status}`);
            }
            
            // Check response time
            if (res.responseTime > 2000) {
                throw new Error(`Failed: API response time too high: ${res.responseTime}ms`);
            }
            
            resolve();
        });
    };

    // Health check endpoint
    await synthetics.executeHttpStep('healthCheck', {
        hostname: new URL(apiUrl).hostname,
        method: 'GET',
        path: '/health',
        port: 443,
        protocol: 'https',
        headers: {},
        body: ''
    }, validateApiResponse);

    // Stage gates API endpoint
    let stageGateUrl = API_URL + '/api/stage-gates';
    await synthetics.executeHttpStep('stageGateApi', {
        hostname: new URL(stageGateUrl).hostname,
        method: 'GET',
        path: '/api/stage-gates',
        port: 443,
        protocol: 'https',
        headers: {},
        body: ''
    }, (res) => {
        return new Promise((resolve, reject) => {
            if (res.status !== 200 && res.status !== 401) { // 401 is OK for unauthorized access
                throw new Error(`Failed: Stage gate API returned status code ${res.status}`);
            }
            resolve();
        });
    });

    // WIP limits API endpoint
    let wipUrl = API_URL + '/api/wip-limits';
    await synthetics.executeHttpStep('wipLimitsApi', {
        hostname: new URL(wipUrl).hostname,
        method: 'GET',
        path: '/api/wip-limits',
        port: 443,
        protocol: 'https',
        headers: {},
        body: ''
    }, (res) => {
        return new Promise((resolve, reject) => {
            if (res.status !== 200 && res.status !== 401) { // 401 is OK for unauthorized access
                throw new Error(`Failed: WIP limits API returned status code ${res.status}`);
            }
            resolve();
        });
    });

    log.info('API health check completed successfully');
};

exports.handler = async () => {
    return await synthetics.executeStep('apiCanaryBlueprint', apiCanaryBlueprint);
};