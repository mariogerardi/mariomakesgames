#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { GamesHubPlatformStack } from "../lib/games-hub-platform-stack";

const app = new cdk.App();
const stageName = String(app.node.tryGetContext("stage") ?? "dev");
if (!/^[a-z][a-z0-9-]*$/.test(stageName)) throw new Error("CDK context stage must be lowercase kebab-case.");

new GamesHubPlatformStack(app, `MarioMakesGames-${stageName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  stageName,
  siteUrl: String(app.node.tryGetContext("siteUrl") ?? "http://localhost:3000"),
});
