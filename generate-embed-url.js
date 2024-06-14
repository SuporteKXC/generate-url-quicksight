import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QuickSightClient, GenerateEmbedUrlForRegisteredUserCommand } from "@aws-sdk/client-quicksight";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import { SimpleJsonFetcher } from "aws-jwt-verify/https";

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse: "access",
  clientId: process.env.CLIENT_ID,
},
{
  jwksCache: new SimpleJwksCache({
    fetcher: new SimpleJsonFetcher({
      defaultRequestOptions: {
        responseTimeout: 10000,
      },
    }),
  }),
});

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({region: process.env.REGION}));

const quicksight = new QuickSightClient({region: process.env.REGION});


function response(statusCode, body){
    return {
        headers: {
            "Access-Control-Allow-Credentials" : true, 
            "Access-Control-Allow-Headers" : "Content-Type",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*"
        },
        statusCode: statusCode,
        body: JSON.stringify(body)
    }
}

export async function handler (event, context) {

    try{
        const token = event.headers.Authorization
        // const token = "eyJraW..."

        if(!token){
            return response(403, {message: "Token não encontrada"})
        }

        let userId
        
        try {
            const payload = await verifier.verify(token);
            console.log("Token is valid. Payload:", payload);
            userId = payload.sub
        } catch(e) {
            console.log(e)
            console.log("Token not valid!");
        }

        if(!userId){
            return response(403, {message: "Token inválida"})
        }

        const getUserDashboardReponse = await dynamo.send(new GetCommand({
            Key:{
                userId: userId
            },
            TableName: process.env.TABLE_NAME
        }))

        const record = getUserDashboardReponse.Item

        console.log('record', record)

        if(!record){
            return response(404, {message: "Usuário não possui Dashboard"})
        }

        const input = { 
            AwsAccountId: process.env.AWS_ACCOUNT_ID,
            UserArn: process.env.DEFAULT_QUICKSIGHT_USER,
            ExperienceConfiguration: { 
                Dashboard: {
                    InitialDashboardId: record.dashboardId, 
                },
            }
        };

        const command = new GenerateEmbedUrlForRegisteredUserCommand(input);

        const getUrlResponse = await quicksight.send(command);

        return response(200, {
            EmbedUrl: getUrlResponse.EmbedUrl
        })
    }catch(e){
        console.log(e)
        return response(500, {message: e})
    }
}

