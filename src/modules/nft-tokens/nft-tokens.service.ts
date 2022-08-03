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

  async findFailedOnes(source: string) {
    return await this.nftTokensModel.find({
      sentAt: { $ne: null },
      metadata: null,
      source
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

  async findNeedToRefreshTokens(source: string, limit: number) {
    return await this.nftTokensModel.find({
      needToRefresh: true,
      source
    },
    {},
    {
      limit
    },
    );
  }

  public async updateNeedToRefreshFlagBatch(tokens: NFTToken[]) {
    // Update needToRefresh flag to false
    // This used to unset metadata and related values however this had unwanted
    // UX where metadata was lost in the UI until the refresh had been completed
    // and this was deemed unacceptable. So now we leave metadata and update it
    // in place. This requires an additional flag be set on the record MetadataConsumer
    // to indicate that the metadata refresh is complete and its new values may
    // be used to update the media files. See m-4589
    //
    await this.nftTokensModel.bulkWrite(tokens.map(x => ({
      updateOne: {
        filter: {
          contractAddress: x.contractAddress,
          tokenId: x.tokenId,        
        },
        update: {
          needToRefresh: false,
          sentForMediaAt: null,  
        },
        upsert: false
      }
    })));
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
