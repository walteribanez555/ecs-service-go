import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

interface EcsGoBaseStackProps extends cdk.StackProps {
  environment: string;
}

export class EcsGoBaseStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: ecs.Cluster;
  public readonly apiRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcsGoBaseStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const projectName = "ecs-go";
    const isProd = environment === "prod";

    cdk.Tags.of(this).add("Project", projectName);
    cdk.Tags.of(this).add("Environment", environment);
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      vpcName: `${projectName}-vpc-${environment}`,
      natGateways: 1,
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    this.apiRepo = new ecr.Repository(this, "ApiRepository", {
      repositoryName: `${projectName}-api-${environment}`,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: !isProd,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: this.vpc,
      clusterName: `${projectName}-cluster-${environment}`,
    });

    new cdk.CfnOutput(this, "ApiRepositoryUri", {
      value: this.apiRepo.repositoryUri,
      description: "ECR URI — push your image here before deploying the service stack",
      exportName: `${projectName}-${environment}-api-repo-uri`,
    });

    new cdk.CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      exportName: `${projectName}-${environment}-cluster-name`,
    });
  }
}
