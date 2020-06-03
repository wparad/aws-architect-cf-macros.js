const { getResources } = require('../../lib/createRoute53DnsValidationRecord');
const { describe, it } = require('mocha');
const { expect } = require('chai');

describe('createRoute53DnsValidationRecord.js', () => {
  describe('getResources()', () => {
    let testCases = [
      {
        name: 'Excludes name and resource records',
        resourceName: 'UnitTest',
        calloutResource: {
          Type: 'unit-test-type',
          Properties: {
            DomainName: 'test'
          }
        },
        expectedResult: {
          Route53ValidationForUnitTest: {
            Type: 'unit-test-type',
            Properties: {
              DomainName: 'test'
            }
          },
          UnitTest: {
            Type: 'AWS::Route53::RecordSet',
            Properties: {
              DomainName: 'test',
              Name: { 'Fn::GetAtt': ['Route53ValidationForUnitTest', 'VerificationRecordName'] },
              ResourceRecords: [{ 'Fn::GetAtt': ['Route53ValidationForUnitTest', 'VerificationRecordValue'] }]
            }
          }
        }
      },
      {
        name: 'Deletes resource property CertificateName',
        resourceName: 'UnitTest',
        calloutResource: {
          Type: 'unit-test-type',
          Properties: {
            DomainName: 'test',
            CertificateName: 'unit-test-cert-arn'
          }
        },
        expectedResult: {
          Route53ValidationForUnitTest: {
            Type: 'unit-test-type',
            Properties: {
              DomainName: 'test',
              CertificateName: 'unit-test-cert-arn'
            }
          },
          UnitTest: {
            Type: 'AWS::Route53::RecordSet',
            Properties: {
              DomainName: 'test',
              Name: { 'Fn::GetAtt': ['Route53ValidationForUnitTest', 'VerificationRecordName'] },
              ResourceRecords: [{ 'Fn::GetAtt': ['Route53ValidationForUnitTest', 'VerificationRecordValue'] }]
            }
          }
        }
      }
    ];
    testCases.forEach(testCase => it(testCase.name, () => {
      let resources = {};
      resources[testCase.resourceName] = testCase.calloutResource;

      let resultResources = getResources(resources, testCase.calloutResource, testCase.resourceName);

      expect(resultResources).to.eql(testCase.expectedResult);
    }));
  });
});

