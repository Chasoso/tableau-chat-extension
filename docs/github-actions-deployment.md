# GitHub Actions AWS Deployment / GitHub Actions AWSデプロイ

## English

This project can deploy automatically with `.github/workflows/deploy-aws.yml`.

The workflow is designed to avoid printing AWS account IDs, bucket names, distribution IDs, API URLs, app URLs, Tableau host names, Tableau users, JWT material, or Connected App secrets.

### Deployment Model

The workflow:

1. Builds and tests the backend.
2. Bundles Lambda handlers with `esbuild`.
3. Builds the frontend with `VITE_API_BASE_URL`.
4. Rewrites the built `.trex` source URL using `EXTENSION_SOURCE_URL`.
5. Assumes an AWS deploy role using GitHub OIDC.
6. Uploads the Lambda zip to a private artifact bucket.
7. Deploys `infra/cloudformation.yaml`.
8. Syncs `frontend/dist` to the generated private S3 bucket.
9. Invalidates the generated CloudFront distribution.

CloudFormation intentionally has no Outputs for URLs or account-specific identifiers.

### GitHub Secrets

Store these as GitHub Actions Secrets, not plain repository Variables:

| Name | Purpose |
| --- | --- |
| `AWS_CFN_STACK_NAME` | CloudFormation stack name. Treat as masked to avoid environment disclosure. |
| `AWS_GHA_DEPLOY_ROLE_ARN` | OIDC role ARN. Contains AWS account ID, so keep it in Secrets. |
| `AWS_CFN_EXECUTION_ROLE_ARN` | CloudFormation execution role ARN. The GitHub role passes only this role to CloudFormation. |
| `AWS_ARTIFACT_BUCKET` | Private bucket used for Lambda deployment artifacts. |
| `FRONTEND_BUCKET_NAME` | Private S3 bucket name for the hosted frontend. It is passed to CloudFormation to keep S3 permissions scoped. |
| `VITE_API_BASE_URL` | API base URL embedded into the frontend build. Prefer `/api` when using the CloudFront `/api/*` behavior in this template. |
| `EXTENSION_SOURCE_URL` | Production HTTPS URL used in the built `.trex` file. |
| `CORS_ALLOWED_ORIGIN` | Allowed frontend origin for API Gateway and Lambda CORS. |
| `TABLEAU_SERVER_URL` | Tableau Cloud / Server URL. |
| `TABLEAU_SITE_CONTENT_URL` | Tableau site content URL. Use an empty secret value only if your GitHub plan and process allow it; otherwise store a placeholder and adjust the workflow. |
| `TABLEAU_CONNECTED_APP_CLIENT_ID` | Connected App Client ID. |
| `TABLEAU_CONNECTED_APP_SECRET_ID` | Connected App Secret ID. |
| `TABLEAU_CONNECTED_APP_SECRET_VALUE` | Connected App Secret Value. |
| `TABLEAU_DEFAULT_SUBJECT` | Tableau user subject for the PoC. Usually an email address. |

GitHub Secrets are masked by default. The workflow also calls `::add-mask::` for these values before using them.

### GitHub Variables

These can be repository Variables if your organization is comfortable with them being visible to repository administrators:

| Name | Default | Purpose |
| --- | --- | --- |
| `AWS_REGION` | none | AWS region for Lambda, API Gateway, DynamoDB, and S3. |
| `TABLEAU_API_VERSION` | `3.25` | Tableau REST API version. |
| `TABLEAU_SCOPES` | `tableau:content:read` | Comma-separated Connected App scopes. |
| `TABLEAU_CONTEXT_PROVIDER` | `mock` | `mock` or `direct`. Use `direct` only after Tableau auth is verified. |

If you consider any of these environment details sensitive, store them as Secrets and update the workflow to read from `secrets.*`.

### OIDC Deploy Role

Create an AWS IAM role trusted by GitHub OIDC. Prefer using two roles:

- GitHub OIDC deploy role: assumed by GitHub Actions.
- CloudFormation execution role: assumed by CloudFormation to create and update stack resources.

This keeps the GitHub role smaller. The GitHub role can upload artifacts, create/execute CloudFormation change sets, pass only the CloudFormation execution role, sync the frontend bucket, and create CloudFront invalidations.

Keep the role ARN in `AWS_GHA_DEPLOY_ROLE_ARN`. Do not paste it into workflow logs or documentation because it contains the AWS account ID.

Trust policy shape:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<owner>/<repo>:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Replace placeholders outside of GitHub logs.

### Recommended GitHub OIDC Deploy Role Policy

Attach a policy like the following to the role stored in `AWS_GHA_DEPLOY_ROLE_ARN`.

Replace placeholders outside GitHub Actions logs. Use the CloudFront distribution wildcard only for bootstrap; after the first deployment, replace it with the concrete distribution ID.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationChangeSetsForThisStack",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStacks",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:GetTemplate",
        "cloudformation:ValidateTemplate"
      ],
      "Resource": [
        "arn:aws:cloudformation:<region>:<account-id>:stack/<stack-name>/*",
        "arn:aws:cloudformation:<region>:<account-id>:changeSet/*/*"
      ]
    },
    {
      "Sid": "PassOnlyCloudFormationExecutionRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<account-id>:role/<cloudformation-execution-role-name>",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "cloudformation.amazonaws.com"
        }
      }
    },
    {
      "Sid": "UploadLambdaArtifact",
      "Effect": "Allow",
      "Action": [
        "s3:AbortMultipartUpload",
        "s3:GetBucketLocation",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads",
        "s3:ListMultipartUploadParts",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::<artifact-bucket>",
        "arn:aws:s3:::<artifact-bucket>/tableau-chat-extension/*"
      ]
    },
    {
      "Sid": "SyncFrontendBucket",
      "Effect": "Allow",
      "Action": [
        "s3:DeleteObject",
        "s3:GetBucketLocation",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::<frontend-bucket>",
        "arn:aws:s3:::<frontend-bucket>/*"
      ]
    },
    {
      "Sid": "InvalidateFrontendDistribution",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::<account-id>:distribution/<distribution-id-or-bootstrap-wildcard>"
    }
  ]
}
```

`cloudfront:CreateInvalidation` belongs on the GitHub OIDC deploy role because the workflow calls `aws cloudfront create-invalidation` directly after CloudFormation finishes. If the stack already exists, replace `<distribution-id-or-bootstrap-wildcard>` with the actual `FrontendDistribution` physical ID. During first bootstrap only, you can temporarily use `*`, then tighten it after the first successful stack creation.

### Recommended CloudFormation Execution Role

Create a separate role trusted by `cloudformation.amazonaws.com`, then store its ARN in `AWS_CFN_EXECUTION_ROLE_ARN`.

Trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudformation.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Attach a policy like this to the CloudFormation execution role. Some create/update actions require `Resource: "*"`, especially API Gateway and CloudFront create-time operations. This is still materially safer than giving those permissions directly to the GitHub OIDC role, because GitHub can only pass this role to CloudFormation.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageNamedApplicationResources",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:UpdateTable",
        "lambda:AddPermission",
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetPolicy",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:PutRetentionPolicy",
        "secretsmanager:CreateSecret",
        "secretsmanager:DeleteSecret",
        "secretsmanager:DescribeSecret",
        "secretsmanager:PutSecretValue",
        "secretsmanager:TagResource",
        "secretsmanager:UntagResource",
        "secretsmanager:UpdateSecret"
      ],
      "Resource": [
        "arn:aws:dynamodb:<region>:<account-id>:table/<stack-name>-chat-history",
        "arn:aws:lambda:<region>:<account-id>:function:<stack-name>-chat",
        "arn:aws:lambda:<region>:<account-id>:function:<stack-name>-health",
        "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/<stack-name>-chat",
        "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/<stack-name>-chat:*",
        "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/<stack-name>-health",
        "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/<stack-name>-health:*",
        "arn:aws:secretsmanager:<region>:<account-id>:secret:<stack-name>/tableau-connected-app-*"
      ]
    },
    {
      "Sid": "DescribeCloudWatchLogsForCloudFormationGetAtt",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ManageBackendExecutionRole",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:DeleteRolePolicy",
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:PutRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateAssumeRolePolicy"
      ],
      "Resource": "arn:aws:iam::<account-id>:role/<stack-name>-backend-role"
    },
    {
      "Sid": "PassBackendRoleOnlyToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<account-id>:role/<stack-name>-backend-role",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    },
    {
      "Sid": "ManageFrontendBucket",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:DeleteBucketPolicy",
        "s3:GetBucketPolicy",
        "s3:GetEncryptionConfiguration",
        "s3:GetBucketPublicAccessBlock",
        "s3:PutBucketPolicy",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketPublicAccessBlock"
      ],
      "Resource": "arn:aws:s3:::<frontend-bucket>"
    },
    {
      "Sid": "ManageApiGatewayAndCloudFrontStackResources",
      "Effect": "Allow",
      "Action": [
        "apigateway:DELETE",
        "apigateway:GET",
        "apigateway:PATCH",
        "apigateway:POST",
        "apigateway:PUT",
        "cloudfront:CreateDistribution",
        "cloudfront:CreateFunction",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:DeleteDistribution",
        "cloudfront:DeleteFunction",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:GetFunction",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:GetOriginAccessControlConfig",
        "cloudfront:PublishFunction",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:UpdateDistribution",
        "cloudfront:UpdateFunction",
        "cloudfront:UpdateOriginAccessControl"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ManageApiGatewayTags",
      "Effect": "Allow",
      "Action": [
        "apigateway:DELETE",
        "apigateway:GET",
        "apigateway:PUT"
      ],
      "Resource": "arn:aws:apigateway:<region>::/tags/*"
    }
  ]
}
```

API Gateway IAM actions are HTTP verbs such as `apigateway:GET`, `apigateway:POST`, `apigateway:PUT`, `apigateway:DELETE`, and `apigateway:PATCH`. Do not use `apigateway:TagResource` or `apigateway:UntagResource`; those are API operation names, not valid IAM action names for API Gateway.

For a stricter production setup, use a permissions boundary on the CloudFormation execution role and split initial provisioning from routine application deployments.

### Artifact Bucket

Create a private S3 bucket for deployment artifacts before the first run and store its name in `AWS_ARTIFACT_BUCKET`.

Recommended bucket controls:

- Block all public access.
- Enable default encryption.
- Enable lifecycle expiration for old `tableau-chat-extension/*/backend.zip` objects.

### First Deployment Order

If the API URL or CloudFront URL is not known yet, use one of these approaches:

1. Preferred: create a stable custom frontend domain first. Set `EXTENSION_SOURCE_URL` and `CORS_ALLOWED_ORIGIN` to that frontend origin, and set `VITE_API_BASE_URL=/api`.
2. Bootstrap: deploy once with `VITE_API_BASE_URL=/api`, a temporary valid `EXTENSION_SOURCE_URL`, and a temporary valid `CORS_ALLOWED_ORIGIN`, then retrieve the generated CloudFront domain manually in AWS Console or CLI outside Actions logs. Update `EXTENSION_SOURCE_URL` and `CORS_ALLOWED_ORIGIN` to the CloudFront origin and rerun.

The CloudFront distribution proxies `/api/*` to API Gateway and rewrites `/api/chat` to `/chat`, so the frontend can call the backend through the same origin. The workflow intentionally does not print generated endpoints.

### Common CloudFormation Failures

If `AWS::ApiGatewayV2::Api` fails with `Invalid API name specified`, make sure `infra/cloudformation.yaml` sets an explicit API name. This project uses:

```yaml
HttpApi:
  Type: AWS::ApiGatewayV2::Api
  Properties:
    Name: !Sub "${AWS::StackName}-http-api"
```

If the stack is already in `ROLLBACK_COMPLETE`, delete the failed stack before rerunning the workflow.

If `AWS::Lambda::Function` fails with an S3 `AccessDenied` error for `backend.zip`, the CloudFormation execution role cannot read the Lambda artifact uploaded by GitHub Actions. Add this statement to the role stored in `AWS_CFN_EXECUTION_ROLE_ARN`:

```json
{
  "Sid": "ReadLambdaArtifactForLambdaCreateFunction",
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:GetObjectVersion"
  ],
  "Resource": "arn:aws:s3:::<artifact-bucket>/tableau-chat-extension/*"
}
```

Attach this to the CloudFormation execution role, not the GitHub OIDC deploy role. The GitHub role uploads the zip, but CloudFormation creates the Lambda function and must read the zip. If the artifact bucket uses SSE-KMS with a customer-managed KMS key, also allow `kms:Decrypt` for that key.

### Logging Rules

The workflow follows these rules:

- Does not use `set -x`.
- Does not print stack outputs.
- Does not call `aws sts get-caller-identity`.
- Sets `mask-aws-account-id: true` on `aws-actions/configure-aws-credentials`.
- Uses `--only-show-errors` and `--no-progress` for S3 uploads.
- Masks CloudFormation physical resource IDs before using them.
- Prints only generic success or missing-setting messages.

If you add steps later, keep the same rules. Avoid `echo` of environment variables, AWS ARNs, URLs, bucket names, distribution IDs, or command outputs that include identifiers.

## 日本語

このプロジェクトは `.github/workflows/deploy-aws.yml` により自動デプロイできます。

このワークフローは、AWSアカウントID、bucket名、distribution ID、API URL、アプリURL、Tableauホスト名、Tableauユーザー、JWT関連情報、Connected App Secret をログに出さないことを意図して設計しています。

### デプロイモデル

ワークフローは以下を実行します。

1. バックエンドをビルドし、テストします。
2. `esbuild` で Lambda handler を bundle します。
3. `VITE_API_BASE_URL` を使ってフロントエンドをビルドします。
4. `EXTENSION_SOURCE_URL` を使ってビルド済み `.trex` の source URL を書き換えます。
5. GitHub OIDC で AWS deploy role を Assume します。
6. Lambda zip をプライベートな artifact bucket へアップロードします。
7. `infra/cloudformation.yaml` をデプロイします。
8. `frontend/dist` を生成されたプライベート S3 bucket へ同期します。
9. 生成された CloudFront distribution の invalidation を実行します。

CloudFormation は、URL や AWSアカウント固有の識別子を Outputs に出さないようにしています。

### GitHub Secrets

以下は通常の repository Variables ではなく、GitHub Actions Secrets として保存してください。

| Name | Purpose |
| --- | --- |
| `AWS_CFN_STACK_NAME` | CloudFormation stack name。環境情報の露出を避けるため mask 対象として扱います。 |
| `AWS_GHA_DEPLOY_ROLE_ARN` | OIDC role ARN。AWSアカウントIDを含むため Secrets に保存します。 |
| `AWS_CFN_EXECUTION_ROLE_ARN` | CloudFormation execution role ARN。GitHub role はこの role だけを CloudFormation に PassRole します。 |
| `AWS_ARTIFACT_BUCKET` | Lambda deployment artifact 用のプライベート bucket。 |
| `FRONTEND_BUCKET_NAME` | ホストされたフロントエンド用のプライベート S3 bucket 名。S3権限を絞るため CloudFormation に渡します。 |
| `VITE_API_BASE_URL` | フロントエンドビルドへ埋め込まれる API base URL。このテンプレートの CloudFront `/api/*` behavior を使う場合は `/api` を推奨します。 |
| `EXTENSION_SOURCE_URL` | ビルド済み `.trex` に書き込む本番 HTTPS URL。 |
| `CORS_ALLOWED_ORIGIN` | API Gateway と Lambda CORS で許可するフロントエンド Origin。 |
| `TABLEAU_SERVER_URL` | Tableau Cloud / Server URL。 |
| `TABLEAU_SITE_CONTENT_URL` | Tableau site content URL。空値が必要な場合は、GitHubの運用で許容できるか確認してください。難しい場合は placeholder を置き、workflow側を調整します。 |
| `TABLEAU_CONNECTED_APP_CLIENT_ID` | Connected App Client ID。 |
| `TABLEAU_CONNECTED_APP_SECRET_ID` | Connected App Secret ID。 |
| `TABLEAU_CONNECTED_APP_SECRET_VALUE` | Connected App Secret Value。 |
| `TABLEAU_DEFAULT_SUBJECT` | PoC 用の Tableau user subject。通常はメールアドレスです。 |

GitHub Secrets は既定で mask されます。ワークフローでも使用前に `::add-mask::` を呼び出します。

### GitHub Variables

以下は、repository administrators に見えても問題ないと組織が判断できる場合のみ、repository Variables として保存できます。

| Name | Default | Purpose |
| --- | --- | --- |
| `AWS_REGION` | none | Lambda、API Gateway、DynamoDB、S3 の AWS region。 |
| `TABLEAU_API_VERSION` | `3.25` | Tableau REST API version。 |
| `TABLEAU_SCOPES` | `tableau:content:read` | Connected App scopes のカンマ区切り値。 |
| `TABLEAU_CONTEXT_PROVIDER` | `mock` | `mock` または `direct`。Tableau認証確認後に `direct` を使います。 |

これらの環境情報も機密に近いと判断する場合は、Secrets に保存し、workflow を `secrets.*` から読む形へ変更してください。

### OIDC Deploy Role

GitHub OIDC を信頼する AWS IAM role を作成します。role は2つに分けるのがおすすめです。

- GitHub OIDC deploy role: GitHub Actions が Assume します。
- CloudFormation execution role: CloudFormation が stack resource を作成・更新するために Assume します。

この分割により、GitHub role 側の権限を小さくできます。GitHub role は artifact upload、CloudFormation change set の作成・実行、CloudFormation execution role への限定的な PassRole、frontend bucket sync、CloudFront invalidation だけを担当します。

Role ARN は `AWS_GHA_DEPLOY_ROLE_ARN` に保存します。AWSアカウントIDを含むため、workflowログやドキュメントに実値を貼らないでください。

Trust policy の形:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<owner>/<repo>:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

placeholder の置き換えは、GitHubログに出ない場所で行ってください。

### 推奨 GitHub OIDC Deploy Role Policy

`AWS_GHA_DEPLOY_ROLE_ARN` に保存する role には、以下のような policy を attach します。

placeholder の置き換えは GitHub Actions ログ外で行ってください。CloudFront distribution の wildcard は bootstrap 用です。初回デプロイ後は具体的な distribution ID に置き換えてください。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationChangeSetsForThisStack",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStacks",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:GetTemplate",
        "cloudformation:ValidateTemplate"
      ],
      "Resource": [
        "arn:aws:cloudformation:<region>:<account-id>:stack/<stack-name>/*",
        "arn:aws:cloudformation:<region>:<account-id>:changeSet/*/*"
      ]
    },
    {
      "Sid": "PassOnlyCloudFormationExecutionRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<account-id>:role/<cloudformation-execution-role-name>",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "cloudformation.amazonaws.com"
        }
      }
    },
    {
      "Sid": "UploadLambdaArtifact",
      "Effect": "Allow",
      "Action": [
        "s3:AbortMultipartUpload",
        "s3:GetBucketLocation",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads",
        "s3:ListMultipartUploadParts",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::<artifact-bucket>",
        "arn:aws:s3:::<artifact-bucket>/tableau-chat-extension/*"
      ]
    },
    {
      "Sid": "SyncFrontendBucket",
      "Effect": "Allow",
      "Action": [
        "s3:DeleteObject",
        "s3:GetBucketLocation",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::<frontend-bucket>",
        "arn:aws:s3:::<frontend-bucket>/*"
      ]
    },
    {
      "Sid": "InvalidateFrontendDistribution",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::<account-id>:distribution/<distribution-id-or-bootstrap-wildcard>"
    }
  ]
}
```

`cloudfront:CreateInvalidation` は GitHub OIDC deploy role に付けます。workflow が CloudFormation 完了後に `aws cloudfront create-invalidation` を直接呼ぶためです。stack がすでに存在する場合は、`<distribution-id-or-bootstrap-wildcard>` を実際の `FrontendDistribution` physical ID に置き換えてください。初回 bootstrap 時だけ一時的に `*` を使い、初回作成後に実IDへ締める運用ができます。

### 推奨 CloudFormation Execution Role

`cloudformation.amazonaws.com` を信頼する別 role を作成し、その ARN を `AWS_CFN_EXECUTION_ROLE_ARN` に保存します。

Trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudformation.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

CloudFormation execution role には以下のような policy を attach します。API Gateway や CloudFront の作成時操作など、一部は `Resource: "*"` が必要になります。それでも、GitHub OIDC role に直接これらの権限を持たせるより安全です。GitHub はこの role を CloudFormation にだけ PassRole できます。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageNamedApplicationResources",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:UpdateTable",
        "lambda:AddPermission",
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetPolicy",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:PutRetentionPolicy",
        "secretsmanager:CreateSecret",
        "secretsmanager:DeleteSecret",
        "secretsmanager:DescribeSecret",
        "secretsmanager:PutSecretValue",
        "secretsmanager:TagResource",
        "secretsmanager:UntagResource",
        "secretsmanager:UpdateSecret"
      ],
      "Resource": [
        "arn:aws:dynamodb:<region>:<account-id>:table/<stack-name>-chat-history",
        "arn:aws:lambda:<region>:<account-id>:function:<stack-name>-chat",
        "arn:aws:lambda:<region>:<account-id>:function:<stack-name>-health",
        "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/<stack-name>-chat",
        "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/<stack-name>-chat:*",
        "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/<stack-name>-health",
        "arn:aws:logs:<region>:<account-id>:log-group:/aws/lambda/<stack-name>-health:*",
        "arn:aws:secretsmanager:<region>:<account-id>:secret:<stack-name>/tableau-connected-app-*"
      ]
    },
    {
      "Sid": "DescribeCloudWatchLogsForCloudFormationGetAtt",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ManageBackendExecutionRole",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:DeleteRolePolicy",
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:PutRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateAssumeRolePolicy"
      ],
      "Resource": "arn:aws:iam::<account-id>:role/<stack-name>-backend-role"
    },
    {
      "Sid": "PassBackendRoleOnlyToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<account-id>:role/<stack-name>-backend-role",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    },
    {
      "Sid": "ManageFrontendBucket",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:DeleteBucketPolicy",
        "s3:GetBucketPolicy",
        "s3:GetEncryptionConfiguration",
        "s3:GetPublicAccessBlock",
        "s3:PutBucketPolicy",
        "s3:PutEncryptionConfiguration",
        "s3:PutPublicAccessBlock"
      ],
      "Resource": "arn:aws:s3:::<frontend-bucket>"
    },
    {
      "Sid": "ManageApiGatewayAndCloudFrontStackResources",
      "Effect": "Allow",
      "Action": [
        "apigateway:DELETE",
        "apigateway:GET",
        "apigateway:PATCH",
        "apigateway:POST",
        "apigateway:PUT",
        "cloudfront:CreateDistribution",
        "cloudfront:CreateFunction",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:DeleteDistribution",
        "cloudfront:DeleteFunction",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:GetFunction",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:GetOriginAccessControlConfig",
        "cloudfront:PublishFunction",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:UpdateDistribution",
        "cloudfront:UpdateFunction",
        "cloudfront:UpdateOriginAccessControl"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ManageApiGatewayTags",
      "Effect": "Allow",
      "Action": [
        "apigateway:DELETE",
        "apigateway:GET",
        "apigateway:PUT"
      ],
      "Resource": "arn:aws:apigateway:<region>::/tags/*"
    }
  ]
}
```

API Gateway の IAM action は `apigateway:GET`、`apigateway:POST`、`apigateway:PUT`、`apigateway:DELETE`、`apigateway:PATCH` のようなHTTP verb形式です。`apigateway:TagResource` や `apigateway:UntagResource` は API operation 名であり、API Gateway の有効な IAM action 名ではないため使わないでください。

より厳密な本番構成では、CloudFormation execution role に permissions boundary を付け、初回基盤作成と通常アプリデプロイを分離してください。

### Artifact Bucket

初回実行前に deployment artifact 用のプライベート S3 bucket を作成し、その名前を `AWS_ARTIFACT_BUCKET` に保存します。

推奨する bucket 制御:

- Public access をすべてブロックする。
- Default encryption を有効化する。
- 古い `tableau-chat-extension/*/backend.zip` オブジェクトに lifecycle expiration を設定する。

### 初回デプロイ順序

API URL や CloudFront URL がまだ不明な場合は、以下のどちらかで進めます。

1. 推奨: 先に安定した frontend custom domain を作成します。`EXTENSION_SOURCE_URL` と `CORS_ALLOWED_ORIGIN` はその frontend origin にし、`VITE_API_BASE_URL=/api` にします。
2. Bootstrap: `VITE_API_BASE_URL=/api`、一時的に有効な `EXTENSION_SOURCE_URL`、一時的に有効な `CORS_ALLOWED_ORIGIN` で一度デプロイします。その後、生成された CloudFront domain を AWS Console または GitHub Actions ログ外の CLI で手動取得し、`EXTENSION_SOURCE_URL` と `CORS_ALLOWED_ORIGIN` を CloudFront origin に更新して再実行します。

CloudFront distribution は `/api/*` を API Gateway にプロキシし、`/api/chat` を `/chat` に書き換えます。そのため、フロントエンドは同一Origin経由でバックエンドを呼べます。ワークフローは生成された endpoint を意図的に出力しません。

### よくある CloudFormation 失敗

`AWS::ApiGatewayV2::Api` が `Invalid API name specified` で失敗する場合は、`infra/cloudformation.yaml` で API 名を明示しているか確認してください。このプロジェクトでは以下を設定しています。

```yaml
HttpApi:
  Type: AWS::ApiGatewayV2::Api
  Properties:
    Name: !Sub "${AWS::StackName}-http-api"
```

すでに stack が `ROLLBACK_COMPLETE` の場合は、失敗した stack を削除してから workflow を再実行してください。

`AWS::Lambda::Function` が `backend.zip` に対する S3 `AccessDenied` で失敗する場合は、CloudFormation execution role が GitHub Actions によりアップロードされた Lambda artifact を読めていません。`AWS_CFN_EXECUTION_ROLE_ARN` に保存している role に以下の statement を追加してください。

```json
{
  "Sid": "ReadLambdaArtifactForLambdaCreateFunction",
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:GetObjectVersion"
  ],
  "Resource": "arn:aws:s3:::<artifact-bucket>/tableau-chat-extension/*"
}
```

これは GitHub OIDC deploy role ではなく、CloudFormation execution role に付けます。GitHub role は zip をアップロードしますが、Lambda 関数を作るのは CloudFormation なので、CloudFormation 側が zip を読む必要があります。artifact bucket が customer-managed KMS key の SSE-KMS を使っている場合は、その key に対する `kms:Decrypt` も許可してください。

### ログ出力ルール

ワークフローは以下のルールに従います。

- `set -x` を使わない。
- stack outputs を出力しない。
- `aws sts get-caller-identity` を呼ばない。
- `aws-actions/configure-aws-credentials` で `mask-aws-account-id: true` を設定する。
- S3 upload では `--only-show-errors` と `--no-progress` を使う。
- CloudFormation physical resource ID は使用前に mask する。
- 成功や設定不足は汎用メッセージのみ出力する。

今後 step を追加する場合も同じルールを維持してください。環境変数、AWS ARN、URL、bucket名、distribution ID、識別子を含むコマンド出力を `echo` しないでください。
