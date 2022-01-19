#!/usr/bin/env node
import "source-map-support/register";
import {Construct} from "constructs";
import {join} from "path";
import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as origin from "aws-cdk-lib/aws-cloudfront-origins";
import * as api from "@aws-cdk/aws-apigatewayv2-alpha";
import {HttpLambdaIntegration} from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

export class RemixStack extends cdk.Stack {
  readonly distributionUrlParameterName = "/remix/distribution/url";

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "StaticAssetsBucket");

    new s3deploy.BucketDeployment(this, 'DeployStaticAssets', {
      sources: [s3deploy.Source.asset(join(__dirname, '../../remix/public'))],
      destinationBucket: bucket,
      destinationKeyPrefix: '_static'
    });

    const fn = new NodejsFunction(this, 'RequestHandler', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'handler',
      entry: join(__dirname, '../../remix/server/index.js'),
      environment: {
        NODE_ENV: "production",
      },
      bundling: {
        nodeModules: ['@remix-run/architect', 'react', 'react-dom'],
      },
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.THREE_DAYS,
      tracing: lambda.Tracing.ACTIVE,
    });

    const integration = new HttpLambdaIntegration("RequestHandlerIntegration", fn, {
      payloadFormatVersion: api.PayloadFormatVersion.VERSION_2_0,
    });

    const httpApi = new api.HttpApi(this, 'WebsiteApi', {
      defaultIntegration: integration,
    });

    const httpApiUrl = `${httpApi.httpApiId}.execute-api.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`;

    const requestHandlerOrigin = new origin.HttpOrigin(httpApiUrl);
    const originRequestPolicy = new cloudfront.OriginRequestPolicy(this, "RequestHandlerPolicy", {
      originRequestPolicyName: "website-request-handler",
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
      // https://stackoverflow.com/questions/65243953/pass-query-params-from-cloudfront-to-api-gateway
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.none(),
    })
    const requestHandlerBehavior: cloudfront.AddBehaviorOptions = {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy,
    }

    const assetOrigin = new origin.S3Origin(bucket);
    const assetBehaviorOptions = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    };

    const distribution = new cloudfront.Distribution(this, "CloudFront", {
      defaultBehavior: {
        origin: requestHandlerOrigin,
        ...requestHandlerBehavior,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    distribution.addBehavior("/_static/*", assetOrigin, assetBehaviorOptions);

    new ssm.StringParameter(this, "DistributionUrlParameter", {
      parameterName: this.distributionUrlParameterName,
      stringValue: distribution.distributionDomainName,
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
