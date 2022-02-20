import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Producer } from 'sqs-producer';
import AWS from 'aws-sdk';
import {
  Message,
  QueueMessageBody,
  SqsProducerHandler,
} from './sqs-producer.types';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NFTTokensService } from '../nft-tokens/nft-tokens.service';

@Injectable()
export class SqsProducerService implements OnModuleInit, SqsProducerHandler {
  public sqsProducer: Producer;
  private readonly logger = new Logger(SqsProducerService.name);

  constructor(
    private configService: ConfigService,
    private readonly nftTokenService: NFTTokensService,
  ) {
    AWS.config.update({
      region: this.configService.get('aws.region'),
      accessKeyId: this.configService.get('aws.accessKeyId'),
      secretAccessKey: this.configService.get('aws.secretAccessKey'),
    });
  }

  public onModuleInit() {
    this.sqsProducer = Producer.create({
      queueUrl: this.configService.get('aws.queueUrl'),
      sqs: new AWS.SQS(),
    });
  }

  /**
   * #1. check if there is any token not processed
   * #2. send to queue
   * #3. mark token as processed
   */
  @Cron('*/3 * * * * *')
  public async checkCollection() {
    // Check if there is any unprocessed collection
    const unprocessed = await this.nftTokenService.findUnprocessed();
    if (!unprocessed || unprocessed.length === 0) {
      return;
    }
    this.logger.log(
      `[CRON Token] Find ${unprocessed.length} unprocessed tokens`,
    );
    await this.nftTokenService.markAsProcessingBatch(unprocessed);

    // Prepare queue messages and sent as batch
    const processedTokens = [];
    for (const token of unprocessed) {
      const id = token.contractAddress + token.tokenId;
      const message: Message<QueueMessageBody> = {
        id,
        body: {
          contractAddress: token.contractAddress,
          tokenId: token.tokenId,
          contractType: token.tokenType,
        },
        groupId: token.contractAddress,
        deduplicationId: id,
      };
      try {
        await this.sendMessage(message);
        processedTokens.push(token);
        this.logger.log(
          `[CRON Token] Successfully sent messages for metadata reterival for token ${token.contractAddress} - ${token.tokenId}`,
        );
      } catch (err) {
        this.logger.error(
          `[CRON Token] Failed to send message for token ${token.contractAddress} - ${token.tokenId}`,
        );
        this.logger.error(err.message);
      }
    }

    // Mark this token
    await this.nftTokenService.markAsProcessedBatch(processedTokens);
    this.logger.log(`[CRON Token] Successfully marked tokens as processed`);
  }

  /**
   * The needToRefresh flag is set to true by users from API
   * #1. check if there is any token which needToRefresh is true
   * #2. send to queue
   * #3. mark needToRefresh to false
   */
  @Cron(CronExpression.EVERY_MINUTE)
  public async checkNeedToRefreshTokens() {
    // Check if there is any needToRefresh Token
    const needToRefreshToken =
      await this.nftTokenService.findNeedToRefreshToken();
    if (!needToRefreshToken) {
      return;
    }
    this.logger.log(
      `[CRON Token - Hard Refresh]: ${needToRefreshToken.contractAddress} - ${needToRefreshToken.tokenId}`,
    );

    // Prepare queue messages and sent as batch
    const id = needToRefreshToken.contractAddress + needToRefreshToken.tokenId;
    const message: Message<QueueMessageBody> = {
      id,
      body: {
        contractAddress: needToRefreshToken.contractAddress,
        contractType: needToRefreshToken.tokenType,
        tokenId: needToRefreshToken.tokenId,
      },
      groupId: needToRefreshToken.contractAddress,
      deduplicationId: id,
    };
    await this.sendMessage(message);
    this.logger.log(
      `[CRON Token - Hard Refresh] Successfully sent messages for token ${needToRefreshToken.contractAddress} - ${needToRefreshToken.tokenId}`,
    );

    // Mark needToRefresh to false
    await this.nftTokenService.updateNeedToRefreshFlag(
      needToRefreshToken.contractAddress,
      needToRefreshToken.tokenId,
      false,
    );
    this.logger.log(
      `[CRON Token - Hard Refresh] Successfully processed token ${needToRefreshToken.contractAddress} - ${needToRefreshToken.tokenId}`,
    );
  }

  /**
   * This is an auto refresh metadata job runs once a day at midnight.
   * This job scans the token's sendAt and metadata fields.
   * If the token's metadata failed to fetch, it will send a message to queue to refresh the metadata.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async checkToRefetchMetadata() {
    // Check if there is any failed collection
    const failedOne = await this.nftTokenService.findFailedOne();
    if (!failedOne) {
      return;
    }
    this.logger.log(
      `[CRON Token - ReSync] Recevied metadata fetched failed token: ${failedOne.contractAddress} - ${failedOne.tokenId}`,
    );

    // Prepare queue messages and sent as batch
    const id = failedOne.contractAddress + failedOne.tokenId;
    const message: Message<QueueMessageBody> = {
      id,
      body: {
        contractAddress: failedOne.contractAddress,
        contractType: failedOne.tokenType,
        tokenId: failedOne.tokenId,
      },
      groupId: failedOne.contractAddress,
      deduplicationId: id,
    };
    await this.sendMessage(message);
    this.logger.log(
      `[CRON Token - ReSync] Successfully sent messages for token ${failedOne.contractAddress} - ${failedOne.tokenId}`,
    );

    // Mark this token
    await this.nftTokenService.markAsProcessed(
      failedOne.contractAddress,
      failedOne.tokenId,
    );
    this.logger.log(
      `[CRON Token - ReSync] Successfully processed token ${failedOne.contractAddress} - ${failedOne.tokenId}`,
    );
  }

  async sendMessage<T = any>(payload: Message<T> | Message<T>[]) {
    const originalMessages = Array.isArray(payload) ? payload : [payload];
    const messages = originalMessages.map((message) => {
      let body = message.body;
      if (typeof body !== 'string') {
        body = JSON.stringify(body) as any;
      }

      return {
        ...message,
        body,
      };
    });

    return await this.sqsProducer.send(messages as any[]);
  }
}
