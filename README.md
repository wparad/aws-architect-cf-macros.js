# aws-architect-cf-macros
Lambda function code to execute cloudformation macros which can simplify aws architect CF templates.

This library contains both the npm package source code to be deployed and a CF template to do the deployment.

## Recommendation

After reviewing the source code to make sure there isn't anything in there you don't want in your AWS region for CF.

```sh
  npm install -g aws-architect-cf-macros
  aws-architect-cf-macros deploy TMP_DEPLOYMENT_BUCKET --profile PROFILE_NAME

```

