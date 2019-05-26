const https = require('https');
const { URL } = require('url');

class CloudFormationExecutionContext {
  constructor() {
    this.statuses = {
      SUCCESS: 'SUCCESS',
      FAILED: 'FAILED'
    };
    this.event = {};
    this.context = {};
  }

  async completeRequest(responseStatus, responseData, physicalResourceId) {
    const responseBody = JSON.stringify({
      Status: responseStatus,
      Reason: `See the details in CloudWatch Log Stream: ${this.context.logStreamName}`,
      PhysicalResourceId: physicalResourceId || this.context.logStreamName,
      StackId: this.event.StackId,
      RequestId: this.event.RequestId,
      LogicalResourceId: this.event.LogicalResourceId,
      NoEcho: false,
      Data: responseData
    }, null, 0);

    console.log('Cloud Formation Result:\n', responseBody);

    const parsedUrl = new URL(this.event.ResponseURL);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'PUT',
      headers: {
        'content-type': '',
        'content-length': responseBody.length
      }
    };

    const cfRequestPromise = new Promise(resolve => {
      const request = https.request(options, response => {
        console.log(`Status code: ${response.statusCode}`);
        console.log(`Status message: ${response.statusMessage}`);
        resolve();
      });

      request.on('error', function(error) {
        console.log(`send(..) failed executing https.request(..): ${error}`);
        resolve();
      });

      request.write(responseBody);
      request.end();
    });

    await cfRequestPromise;
  }
}

module.exports = new CloudFormationExecutionContext();
