# Redmica on Fargate
## ローカル実行
### 起動
```
cd redmine
cp configuration.yml.sample configuration.yml
dokcer compose up --build
```

### アクセス
* http://localhost:3000

## Redmica設定
[redmine/configuration.yml](redmine/configuration.yml)

## CDK設定
[cdk/cdk.json](cdk/cdk.json)
* existingVpcId: 既存のVPCを利用する場合(要 NAT Gateway)
* existingAlbArn: 既存のALBを利用する場合
* createVpcEndpoint: VPC Endpointを作成する(true/false)

## デプロイ(要AWS 認証情報)
```
cd cdk
cdk deploy
```
