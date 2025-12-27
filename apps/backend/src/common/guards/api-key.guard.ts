import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AgentsService } from '../../agents/agents.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private agentsService: AgentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { agent: { agentId: string } }>();

    // Extract API key from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // Parse Bearer token
    const apiKey = authHeader.replace(/^Bearer\s+/i, '');
    if (!apiKey.startsWith('sk-')) {
      throw new UnauthorizedException('Invalid API key format');
    }

    try {
      // Validate API key → get agent
      const agent = await this.agentsService.findByApiKey(apiKey);

      // Check agent is active
      if (agent.status !== 'active') {
        throw new UnauthorizedException('Agent is not active');
      }

      // Attach agent to request for use in controllers
      request.agent = agent;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or inactive API key');
    }
  }
}
