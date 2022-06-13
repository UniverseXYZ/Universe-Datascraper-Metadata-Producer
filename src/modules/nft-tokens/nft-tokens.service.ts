import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { NFTToken, NFTTokensDocument } from './schemas/nft-tokens.schema';
import { NFTTokensDTO } from './dto/nft-tokens.dto';

@Injectable()
export class NFTTokensService {
  constructor(
    @InjectModel(NFTToken.name)
    private readonly nftTokensModel: Model<NFTTokensDocument>,
  ) {}

  async updateOne(nftToken: NFTTokensDTO) {
    const { contractAddress, tokenId, ...res } = nftToken;
    await this.nftTokensModel.updateOne(
      { contractAddress, tokenId },
      { ...res },
    );
  }

  async findUnprocessedOne() {
    return await this.nftTokensModel.findOne({
      sentAt: null,
    });
  }

  async findUnprocessed(source: string, limit: number) {
    return await this.nftTokensModel.find(
      {
        sentAt: null,
        processingSentAt: null,
        source: source,
      },
      {},
      {
        limit
      },
    );
  }

  async findFailedOne() {
    return await this.nftTokensModel.findOne({
      sentAt: { $ne: null },
      metadata: null,
    });
  }

  public async markAsProcessed(contractAddress: string, tokenId: string) {
    await this.nftTokensModel.updateOne(
      { contractAddress, tokenId },
      {
        sentAt: new Date(),
      },
    );
  }

  async findNeedToRefreshToken() {
    return await this.nftTokensModel.findOne({
      needToRefresh: true,
    });
  }

  public async updateNeedToRefreshFlag(
    contractAddress: string,
    tokenId: string,
  ) {
    // Update needToRefresh flag to false
    // Trigger Mediafile to be updated by setting sentForMediaAt to null and
    // remove metadata, externalDomainViewUrl and alternativeMediaFiles
    await this.nftTokensModel.updateOne(
      { contractAddress, tokenId },
      {
        needToRefresh: false,
        sentForMediaAt: null,
        $unset: {
          metadata: '',
          externalDomainViewUrl: '',
          alternativeMediaFiles: '',
        },
      },
    );
  }

  public async markAsProcessedBatch(tokens: NFTToken[]) {
    await this.nftTokensModel.bulkWrite(
      tokens.map((x) => ({
        updateOne: {
          filter: {
            contractAddress: x.contractAddress,
            tokenId: x.tokenId,
          },
          update: { sentAt: new Date() },
          upsert: false,
        },
      })),
    );
  }

  public async markAsProcessingBatch(tokens: NFTToken[]) {
    await this.nftTokensModel.bulkWrite(
      tokens.map((x) => ({
        updateOne: {
          filter: {
            contractAddress: x.contractAddress,
            tokenId: x.tokenId,
          },
          update: { processingSentAt: new Date() },
          upsert: false,
        },
      })),
    );
  }
}
