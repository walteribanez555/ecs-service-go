#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { EcsGoBaseStack } from "../lib/ecs-go-base-stack";
import { EcsGoServiceStack } from "../lib/ecs-go-service-stack";

const app = new cdk.App();

const environment = app.node.tryGetContext("environment") || "dev";
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || "us-east-1";

const env = { account, region };

const baseStack = new EcsGoBaseStack(app, `EcsGoBase-${environment}`, { env, environment });

new EcsGoServiceStack(app, `EcsGoService-${environment}`, {
  env,
  environment,
  vpc: baseStack.vpc,
  cluster: baseStack.cluster,
  apiRepo: baseStack.apiRepo,
});
