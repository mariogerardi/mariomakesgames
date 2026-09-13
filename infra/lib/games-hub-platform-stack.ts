import * as cdk from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface GamesHubPlatformStackProps extends cdk.StackProps {
  stageName: string;
  siteUrl: string;
}

export class GamesHubPlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GamesHubPlatformStackProps) {
    super(scope, id, props);

    const prefix = `mariomakesgames-${props.stageName}`;
    const localUrl = "http://localhost:3000";
    const allowedOrigins = [...new Set([localUrl, props.siteUrl])];

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${prefix}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = new cognito.UserPoolClient(this, "WebClient", {
      userPool,
      userPoolClientName: `${prefix}-web`,
      generateSecret: false,
      preventUserExistenceErrors: true,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: allowedOrigins.map((origin) => `${origin}/auth/callback`),
        logoutUrls: allowedOrigins,
      },
    });

    const authDomain = userPool.addDomain("ManagedLoginDomain", {
      cognitoDomain: { domainPrefix: `${prefix}-${cdk.Stack.of(this).account}` },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    const managedLoginMark = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#20201f"/><text x="48" y="59" fill="#fffdf8" font-family="Arial, sans-serif" font-size="32" font-weight="700" text-anchor="middle">m!</text></svg>`,
    ).toString("base64");
    const managedLoginBranding = new cognito.CfnManagedLoginBranding(this, "ManagedLoginBranding", {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      settings: {
        categories: {
          global: { colorSchemeMode: "LIGHT", spacingDensity: "REGULAR" },
          form: {
            displayGraphics: true,
            location: { horizontal: "CENTER", vertical: "CENTER" },
            sessionTimerDisplay: "NONE",
          },
        },
        components: {
          form: {
            borderRadius: 20,
            lightMode: { backgroundColor: "ffffffff", borderColor: "d9dee4ff" },
            logo: { enabled: true, formInclusion: "IN", location: "CENTER", position: "TOP" },
          },
          pageBackground: { image: { enabled: false }, lightMode: { color: "f3f5f7ff" } },
          pageText: {
            lightMode: {
              bodyColor: "666d76ff",
              headingColor: "17191dff",
              descriptionColor: "666d76ff",
            },
          },
          primaryButton: {
            lightMode: {
              defaults: { backgroundColor: "20201fff", textColor: "fffdf8ff" },
              hover: { backgroundColor: "343432ff", textColor: "ffffffff" },
              active: { backgroundColor: "111110ff", textColor: "ffffffff" },
            },
          },
          secondaryButton: {
            lightMode: {
              defaults: { backgroundColor: "ffffffff", borderColor: "b8bec5ff", textColor: "34383dff" },
              hover: { backgroundColor: "f3f5f7ff", borderColor: "8c939cff", textColor: "17191dff" },
              active: { backgroundColor: "e8ebeeff", borderColor: "737b84ff", textColor: "17191dff" },
            },
          },
        },
        componentClasses: {
          buttons: { borderRadius: 10 },
          input: {
            borderRadius: 10,
            lightMode: {
              defaults: { backgroundColor: "fafbfcff", borderColor: "b8bec5ff" },
              placeholderColor: "747b84ff",
            },
          },
          inputLabel: { lightMode: { textColor: "34383dff" } },
          link: {
            lightMode: {
              defaults: { textColor: "454b53ff" },
              hover: { textColor: "17191dff" },
            },
          },
          focusState: { lightMode: { borderColor: "17191dff" } },
        },
      },
      assets: [{
        bytes: managedLoginMark,
        category: "FORM_LOGO",
        colorMode: "LIGHT",
        extension: "SVG",
      }],
    });
    managedLoginBranding.node.addDependency(authDomain);

    new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "admin",
      description: "Puzzle Studio and platform administration.",
    });

    const tableDefaults = {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    } as const;

    const contentTable = new dynamodb.Table(this, "ContentTable", {
      ...tableDefaults,
      tableName: `${prefix}-content`,
    });
    const playerTable = new dynamodb.Table(this, "PlayerTable", {
      ...tableDefaults,
      tableName: `${prefix}-players`,
    });
    playerTable.addGlobalSecondaryIndex({
      indexName: "gsi1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    const socialTable = new dynamodb.Table(this, "SocialTable", {
      ...tableDefaults,
      tableName: `${prefix}-social`,
    });
    socialTable.addGlobalSecondaryIndex({
      indexName: "gsi1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const payloadBucket = new s3.Bucket(this, "PuzzlePayloadBucket", {
      bucketName: `${prefix}-puzzle-payloads-${cdk.Stack.of(this).account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const handlerLogGroup = new logs.LogGroup(this, "ApiHandlerLogs", {
      logGroupName: `/aws/lambda/${prefix}-api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const handler = new nodejs.NodejsFunction(this, "ApiHandler", {
      entry: "infra/lambda/api.ts",
      functionName: `${prefix}-api`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logGroup: handlerLogGroup,
      bundling: { minify: true, sourceMap: true, target: "node22" },
      environment: {
        CONTENT_TABLE_NAME: contentTable.tableName,
        PLAYER_TABLE_NAME: playerTable.tableName,
        SOCIAL_TABLE_NAME: socialTable.tableName,
        PUZZLE_PAYLOAD_BUCKET: payloadBucket.bucketName,
        STAGE_NAME: props.stageName,
      },
    });
    playerTable.grantReadWriteData(handler);

    const apiAccessLogs = new logs.LogGroup(this, "ApiAccessLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${prefix}-api`,
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: allowedOrigins,
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.PATCH, apigwv2.CorsHttpMethod.PUT, apigwv2.CorsHttpMethod.DELETE, apigwv2.CorsHttpMethod.OPTIONS],
        maxAge: cdk.Duration.days(1),
      },
    });
    const integration = new integrations.HttpLambdaIntegration("ApiIntegration", handler);
    const authorizer = new authorizers.HttpUserPoolAuthorizer("UserPoolAuthorizer", userPool, {
      userPoolClients: [userPoolClient],
    });

    api.addRoutes({ path: "/health", methods: [apigwv2.HttpMethod.GET], integration });
    api.addRoutes({ path: "/v1/me", methods: [apigwv2.HttpMethod.GET], integration, authorizer });
    api.addRoutes({ path: "/v1/me", methods: [apigwv2.HttpMethod.PATCH], integration, authorizer });
    api.addRoutes({ path: "/v1/runs", methods: [apigwv2.HttpMethod.GET], integration, authorizer });
    api.addRoutes({ path: "/v1/runs/{runId}", methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE], integration, authorizer });
    api.addRoutes({ path: "/v1/admin/ping", methods: [apigwv2.HttpMethod.GET], integration, authorizer });

    new apigwv2.HttpStage(this, "DefaultStage", {
      httpApi: api,
      stageName: "$default",
      autoDeploy: true,
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(apiAccessLogs),
        format: apigw.AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: false,
        }),
      },
    });

    new cloudwatch.Alarm(this, "ApiErrorsAlarm", {
      alarmName: `${prefix}-lambda-errors`,
      metric: handler.metricErrors({ statistic: "sum", period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    cdk.Tags.of(this).add("application", "mariomakesgames");
    cdk.Tags.of(this).add("stage", props.stageName);

    new cdk.CfnOutput(this, "ApiBaseUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoDomain", {
      value: `https://${authDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
