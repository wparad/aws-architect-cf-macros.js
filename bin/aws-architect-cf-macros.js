#!/usr/bin/env node

const path = require('path');
const commander = require('commander');
const aws = require('aws-sdk');

const packageMetadataFile = path.join(__dirname, '..', 'package.json');
const packageMetadata = require(packageMetadataFile);

commander
  .command('deploy <bucket>')
  .description('Deploy the AWS Architect macro to your default region from an s3 bucket.')
  .usage('deploy <bucket> --profile PROFILE_NAME')
  .option('-p, --profile <profile>', 'set the AWS profile to use')
  .action(async (bucket, options) => {
    if (options && options.profile) {
      aws.config.credentials = new aws.SharedIniFileCredentials({ profile: options.profile });
    }

    const AwsArchitect = require('aws-architect');
    let apiOptions = {
      deploymentBucket: bucket,
      sourceDirectory: path.join(__dirname, '..', 'lib'),
      description: 'AWS Architect Macro'
    };
    let awsArchitect = new AwsArchitect(packageMetadata, apiOptions);
    let stackTemplate = require('./cloudFormationMacroTemplate.json');

    try {
      let stackConfiguration = {
        changeSetName: 'InitialMacroDeployment',
        stackName: 'AwsArchitectMacros',
        automaticallyProtectStack: true
      };
      const parameters = {
        deploymentBucketName: bucket,
        deploymentKeyName: `${packageMetadata.name}/${packageMetadata.version}/lambda.zip`
      };
      await awsArchitect.ValidateTemplate(stackTemplate, stackConfiguration);
      await awsArchitect.PublishLambdaArtifactPromise({ autoHandleCompileOfSourceDirectory: false });
      await awsArchitect.deployTemplate(stackTemplate, stackConfiguration, parameters);
      console.log('Done');
    } catch (failure) {
      console.log(failure);
      process.exit(1);
    }
  });

commander.on('*', () => {
  console.log(`Unknown Command: ${commander.args.join(' ')}`);
  commander.help();
  process.exit(0);
});
commander.parse(process.argv[2] ? process.argv : process.argv.concat(['build']));
