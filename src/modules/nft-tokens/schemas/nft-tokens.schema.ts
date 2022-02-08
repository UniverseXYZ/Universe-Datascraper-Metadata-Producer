import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'nft-tokens' })
export class NFTTokens {
  @Prop({ _id: true })
  public readonly _id: string;

  @Prop({ trim: true, index: true, required: true })
  public contractAddress: string;

  @Prop({ trim: true, index: true, required: true })
  public tokenId: string;

  @Prop({ index: true, required: true, enum: ['ERC721', 'ERC1155'] })
  public tokenType: string;

  @Prop()
  public externalDomainViewUrl: string;

  @Prop({ type: Object })
  public metadata: any;

  @Prop()
  public firstOwner: string;

  @Prop()
  public metadataFetchError: string;

  @Prop()
  public sentAt: Date;
}

export type NFTTokensDocument = NFTTokens & Document;

export const NFTTokensSchema: SchemaFactory =
  SchemaFactory.createForClass(NFTTokens);
