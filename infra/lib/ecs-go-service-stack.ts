import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

interface EcsGoServiceStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  cluster: ecs.Cluster;
  apiRepo: ecr.Repository;
}

export class EcsGoServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsGoServiceStackProps) {
    super(scope, id, props);

    const { environment, vpc, cluster, apiRepo } = props;
    const projectName = "ecs-go";
    const isProd = environment === "prod";

    cdk.Tags.of(this).add("Project", projectName);
    cdk.Tags.of(this).add("Environment", environment);
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    const logGroup = new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: `/ecs/${projectName}/api/${environment}`,
      retention: isProd ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const apiFargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "ApiFargateService", {
      cluster,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(apiRepo, `${environment}-latest`),
        containerName: "api",
        containerPort: 8080,
        environment: {
          ENV: environment,
          PORT: "8080",
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: `${projectName}-api`,
          logGroup,
        }),
      },
      publicLoadBalancer: true,
      desiredCount: 1,
      minHealthyPercent: isProd ? 100 : 50,
      cpu: isProd ? 512 : 256,
      memoryLimitMiB: isProd ? 1024 : 512,
      serviceName: `api-service-${environment}`,
      listenerPort: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheckGracePeriod: isProd ? cdk.Duration.seconds(120) : cdk.Duration.seconds(30),
      circuitBreaker: { enable: true, rollback: true },
    });

    apiFargateService.targetGroup.configureHealthCheck({
      path: "/health",
      healthyHttpCodes: "200",
      healthyThresholdCount: 2,
      unhealthyThresholdCount: isProd ? 5 : 3,
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(10),
    });

    if (!isProd) {
      apiFargateService.targetGroup.setAttribute("deregistration_delay.timeout_seconds", "30");
    }

    const scaling = apiFargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: isProd ? 10 : 3,
    });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });
    scaling.scaleOnMemoryUtilization("MemoryScaling", { targetUtilizationPercent: 80 });

    const alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: `${projectName}-alerts-${environment}`,
      displayName: `ECS Go Alerts - ${environment}`,
    });

    new cloudwatch.Alarm(this, "ApiHighCpuAlarm", {
      metric: apiFargateService.service.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      alarmDescription: `[${environment.toUpperCase()}] API CPU above 80%`,
    }).addAlarmAction(new actions.SnsAction(alertTopic));

    new cloudwatch.Alarm(this, "ApiUnhealthyHostsAlarm", {
      metric: apiFargateService.targetGroup.metrics.unhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
      alarmDescription: `[${environment.toUpperCase()}] API has unhealthy hosts`,
    }).addAlarmAction(new actions.SnsAction(alertTopic));

    new cdk.CfnOutput(this, "ApiLoadBalancerDns", {
      value: apiFargateService.loadBalancer.loadBalancerDnsName,
      description: "API Load Balancer DNS",
      exportName: `${projectName}-${environment}-api-lb-dns`,
    });
  }
}
