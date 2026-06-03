import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { AgentsService } from '../../agents/agents.service';
import { extractErrorInfo } from '../utils/error.utils';
import { validateApiKeyFormat } from '../utils/crypto.utils';

/**
 * Request interface after authentication
 *
 * This is what ApiKeyGuard attaches to the request object:
 * - org: Organization context (always present)
 * - agent: Agent context (only if agentId in request)
 */
interface AuthenticatedRequest {
  headers: Headers;
  org: {
    orgId: string;
  };
  agent?: {
    agentId: string;
    orgId: string;
  };
  body?: any;
  params?: any;
  query?: any;
}

/**
 * API Key Guard - Organization-Level Authentication
 *
 * Flow:
 * 1. Extract API key from Authorization header
 * 2. Validate format (sk-org-xxx-yyy)
 * 3. Authenticate: Verify key exists and is active
 * 4. Attach org context to request
 * 5. If agentId present: validate agent belongs to org
 *
 * Security:
 * - API keys are org-scoped (not agent-scoped)
 * - All agents in an org share the same API keys
 * - Agent-org membership is validated on every request
 * - Prevents cross-org agent access
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private apiKeysService: ApiKeysService,
    private agentsService: AgentsService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // 1. Extract Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // 2. Extract API key (remove "Bearer " prefix)
    const apiKey = authHeader.replace(/^Bearer\s+/i, '');

    // 3. Validate format (quick check before DB lookup)
    const { valid } = validateApiKeyFormat(apiKey);
    if (!valid) {
      throw new UnauthorizedException(
        'Invalid API key format. Expected: sk-org-{orgId}-{random}',
      );
    }

    try {
      // 4. Authenticate: Verify API key (throws if invalid/revoked/expired)
      const key = await this.apiKeysService.findByApiKey(apiKey);

      // 5. Attach org context to request
      request.org = { orgId: key.orgId };

      // 6. If agentId is in request, validate it belongs to org
      const getAgentId = (obj: unknown): string | undefined => {
        if (obj && typeof obj === 'object' && 'agentId' in obj) {
          const agentId = (obj as { agentId: unknown }).agentId;
          return typeof agentId === 'string' ? agentId : undefined;
        }
        return undefined;
      };

      const bodyAgentId = getAgentId(request.body);
      const paramsAgentId = getAgentId(request.params);
      const queryAgentId = getAgentId(request.query);

      const agentId = bodyAgentId || paramsAgentId || queryAgentId;

      if (agentId) {
        const agent = await this.agentsService.findOne(agentId);

        // CRITICAL: Verify agent belongs to this org
        if (agent.orgId !== key.orgId) {
          this.logger.warn('Cross-org agent access attempt', {
            requestedAgentId: agentId,
            requestedAgentOrgId: agent.orgId,
            authenticatedOrgId: key.orgId,
          });

          throw new UnauthorizedException(
            `Agent ${agentId} does not belong to your organization`,
          );
        }

        // Verify agent is active
        if (agent.status !== 'active') {
          throw new UnauthorizedException(`Agent ${agentId} is not active`);
        }

        // Attach agent context to request
        request.agent = {
          agentId: agent.agentId,
          orgId: agent.orgId,
        };
      }

      return true;
    } catch (error) {
      // Re-throw UnauthorizedException as-is
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Log unexpected errors
      const { message, stack } = extractErrorInfo(error);
      this.logger.error('API key validation failed', {
        error: message,
        stack,
      });

      throw new UnauthorizedException('Invalid or inactive API key');
    }
  }
}
