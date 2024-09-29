import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class RedmineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // VPC
    const existingVpcId = this.node.tryGetContext('existingVpcId');
    const vpc = existingVpcId
      ? ec2.Vpc.fromLookup(this, 'ExistingVpc', { vpcId: existingVpcId })
      : new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });

    const createVpcEndpoint = this.node.tryGetContext('createVpcEndpoint');
    if (createVpcEndpoint) {
      new ec2.InterfaceVpcEndpoint(this, 'SecretsManagerVpcEndpoint', {
        vpc,
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      });
      new ec2.InterfaceVpcEndpoint(this, 'EcrVpcEndpoint', {
        vpc,
        service: ec2.InterfaceVpcEndpointAwsService.ECR,
      });
      new ec2.InterfaceVpcEndpoint(this, 'EcrDockerVpcEndpoint', {
        vpc,
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      });
      new ec2.InterfaceVpcEndpoint(this, 'LogsVpcEndpoint', {
        vpc,
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      });
      new ec2.GatewayVpcEndpoint(this, 'S3VpcEndpoint', {
        vpc,
        service: ec2.GatewayVpcEndpointAwsService.S3,
      });
    }


    // ALB
    const existingAlbArn = this.node.tryGetContext('existingAlbArn');
    const alb = existingAlbArn
      ? elbv2.ApplicationLoadBalancer.fromLookup(this, 'ExistingAlb', { loadBalancerArn: existingAlbArn })
      : new elbv2.ApplicationLoadBalancer(this, 'Alb', { vpc, internetFacing: true });


    // EFS
    const fileSystem = new efs.FileSystem(this, 'FileSystem', {
      vpc,
      enableAutomaticBackups: true,
      encrypted: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_7_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      securityGroup: new ec2.SecurityGroup(this, 'FileSystemSecurityGroup', {
        vpc,
        allowAllOutbound: true,
      }),
    });

    const redmineFilesVolumeName = 'redmine-files'
    const redmineGitVolumeName = 'redmine-git'
    const postgresVolumeName = 'redmine-db'

    const redmineFilesAccessPoint = new efs.AccessPoint(this, 'RedmineFilesAccessPoint', {
      fileSystem: fileSystem,
      path: '/' + redmineFilesVolumeName,
      posixUser: {
        gid: '999',
        uid: '999',
      },
      createAcl: {
        ownerGid: '999',
        ownerUid: '999',
        permissions: '755',
      },
    })

    const redmineGitAccessPoint = new efs.AccessPoint(this, 'RedmineGitAccessPoint', {
      fileSystem: fileSystem,
      path: '/' + redmineGitVolumeName,
      posixUser: {
        gid: '999',
        uid: '999',
      },
      createAcl: {
        ownerGid: '999',
        ownerUid: '999',
        permissions: '755',
      },
    })

    const postgresAccessPoint = new efs.AccessPoint(this, 'PostgresAccessPoint', {
      fileSystem: fileSystem,
      path: '/' + postgresVolumeName,
      posixUser: {
        gid: '70',
        uid: '70',
      },
      createAcl: {
        ownerGid: '70',
        ownerUid: '70',
        permissions: '700',
      },
    })


    // ECS
    const redmineImage = new ecr_assets.DockerImageAsset(this, 'RedmineImage', {
      assetName: 'RedmineImage',
      directory: '../redmine/',
      file: 'RedmineDockerfile',
    });
    const postgresImage = new ecr_assets.DockerImageAsset(this, 'PostgresImage', {
      assetName: 'RedminePostgresImage',
      directory: '../redmine/',
      file: 'PostgresDockerfile',
    });

    const postgresSecret = new secretsmanager.Secret(this, 'PostgresSecret', {
      secretName: 'RedminePostgresSecret',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      executionRole: executionRole,
      cpu: 512,
      memoryLimitMiB: 1024,
      volumes: [
        {
          name: redmineFilesVolumeName,
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              iam: 'ENABLED',
              accessPointId: redmineFilesAccessPoint.accessPointId,
            },
          },
        },
        {
          name: redmineGitVolumeName,
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              iam: 'ENABLED',
              accessPointId: redmineGitAccessPoint.accessPointId,
            },
          },
        },
        {
          name: postgresVolumeName,
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              iam: 'ENABLED',
              accessPointId: postgresAccessPoint.accessPointId,
            },
          },
        },
      ],
    });

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/redmine',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const redmineContainer = taskDefinition.addContainer('RedmineContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(redmineImage),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'redmine',
        logGroup: logGroup,
      }),
      environment: {
        REDMINE_DB_POSTGRES: 'localhost',
        REDMINE_PLUGINS_MIGRATE: 'true',
      },
      secrets: {
        REDMINE_DB_PASSWORD: ecs.Secret.fromSecretsManager(postgresSecret, 'password'),
        REDMINE_DB_USERNAME: ecs.Secret.fromSecretsManager(postgresSecret, 'username'),
      },
      portMappings: [{ containerPort: 3000, protocol: ecs.Protocol.TCP }],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f localhost:3000/login || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(3),
        retries: 5,
        startPeriod: cdk.Duration.seconds(10),
      },
    });

    const postgresContainer = taskDefinition.addContainer('PostgresContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(postgresImage),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'postgres',
        logGroup: logGroup,
      }),
      secrets: {
        POSTGRES_PASSWORD: ecs.Secret.fromSecretsManager(postgresSecret, 'password'),
        POSTGRES_USER: ecs.Secret.fromSecretsManager(postgresSecret, 'username'),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'pg_isready -U postgres'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(3),
        retries: 5,
        startPeriod: cdk.Duration.seconds(10),
      },
    });

    const applicationLoadBalancedFargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      vpc,
      taskDefinition,
      loadBalancer: alb,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      desiredCount: 1,
    });

    applicationLoadBalancedFargateService.targetGroup.configureHealthCheck({
      path: '/login',
    })


    // mount
    fileSystem.connections.securityGroups[0].addIngressRule(
      applicationLoadBalancedFargateService.service.connections.securityGroups[0],
      ec2.Port.tcp(2049),
    )

    fileSystem.grantReadWrite(applicationLoadBalancedFargateService.taskDefinition.taskRole)

    redmineContainer.addMountPoints(
      {
        containerPath: '/usr/src/redmine/files',
        sourceVolume: redmineFilesVolumeName,
        readOnly: false,
      },
      {
        containerPath: '/usr/src/redmine/repositories',
        sourceVolume: redmineGitVolumeName,
        readOnly: false,
      }
    );

    postgresContainer.addMountPoints({
      containerPath: '/var/lib/postgresql/data',
      sourceVolume: postgresVolumeName,
      readOnly: false,
    });
  }
}
