import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { AgentsService } from '../../agents/agents.service';
import { extractErrorInfo } from '../utils/error.utils';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private agentsService: AgentsService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { agent: { agentId: string } }>();

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const apiKey = authHeader.replace(/^Bearer\s+/i, '');
    if (!apiKey.startsWith('sk-')) {
      throw new UnauthorizedException('Invalid API key format');
    }

    try {
      const agent = await this.agentsService.findByApiKey(apiKey);

      if (agent.status !== 'active') {
        throw new UnauthorizedException('Agent is not active');
      }

      request.agent = agent;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const { message, stack } = extractErrorInfo(error);
      this.logger.error('API key validation failed', {
        error: message,
        stack,
      });

      throw new UnauthorizedException('Invalid or inactive API key');
    }
  }
}
