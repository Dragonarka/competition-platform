import { Module } from '@nestjs/common';
import { CompetitionGateway } from './gateways/competition.gateway';

@Module({
  providers: [CompetitionGateway],
  exports: [CompetitionGateway],
})
export class WebsocketModule {}
