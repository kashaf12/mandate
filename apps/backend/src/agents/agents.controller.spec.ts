import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import * as schema from '../database/schema';

describe('AgentsController', () => {
  let controller: AgentsController;
  let mockAgentsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const mockAgent: schema.Agent = {
    id: 'uuid-123',
    agentId: 'agent-abc123',
    apiKeyHash: 'hashed-key',
    name: 'Test Agent',
    principal: 'test@example.com',
    environment: 'production',
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockAgentsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
      ],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create agent and return response with API key', async () => {
      const createDto: CreateAgentDto = {
        name: 'Test Agent',
        principal: 'test@example.com',
      };

      const apiKey = 'sk-test-api-key';
      mockAgentsService.create.mockResolvedValue({
        agent: mockAgent,
        apiKey,
      });

      const result = await controller.create(createDto);

      expect(result).toHaveProperty('apiKey');
      expect(result).toHaveProperty('agentId');
      expect(result).toHaveProperty('name');
      expect(result.apiKey).toBe(apiKey);
      expect(result.agentId).toBe(mockAgent.agentId);
      expect(result.name).toBe(mockAgent.name);
      expect(mockAgentsService.create).toHaveBeenCalledWith(createDto);
      expect(mockAgentsService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('should return all agents', async () => {
      const mockAgents: schema.Agent[] = [mockAgent];
      mockAgentsService.findAll.mockResolvedValue(mockAgents);

      const result = await controller.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('agentId');
      expect(result[0]).toHaveProperty('name');
      expect(result[0].agentId).toBe(mockAgent.agentId);
      expect(result[0].name).toBe(mockAgent.name);
      expect(mockAgentsService.findAll).toHaveBeenCalled();
      expect(mockAgentsService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no agents exist', async () => {
      mockAgentsService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
      expect(mockAgentsService.findAll).toHaveBeenCalled();
      expect(mockAgentsService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return agent by ID', async () => {
      mockAgentsService.findOne.mockResolvedValue(mockAgent);

      const result = await controller.findOne('agent-abc123');

      expect(result).toHaveProperty('agentId');
      expect(result).toHaveProperty('name');
      expect(result.agentId).toBe(mockAgent.agentId);
      expect(result.name).toBe(mockAgent.name);
      expect(mockAgentsService.findOne).toHaveBeenCalledWith('agent-abc123');
      expect(mockAgentsService.findOne).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when agent not found', async () => {
      mockAgentsService.findOne.mockRejectedValue(
        new NotFoundException('Agent agent-abc123 not found'),
      );

      await expect(controller.findOne('agent-abc123')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockAgentsService.findOne).toHaveBeenCalledWith('agent-abc123');
    });
  });

  describe('update', () => {
    it('should update agent and return updated agent', async () => {
      const updateDto: UpdateAgentDto = {
        name: 'Updated Name',
      };

      const updatedAgent = { ...mockAgent, name: 'Updated Name' };
      mockAgentsService.update.mockResolvedValue(updatedAgent);

      const result = await controller.update('agent-abc123', updateDto);

      expect(result).toHaveProperty('agentId');
      expect(result).toHaveProperty('name');
      expect(result.name).toBe('Updated Name');
      expect(result.agentId).toBe(mockAgent.agentId);
      expect(mockAgentsService.update).toHaveBeenCalledWith(
        'agent-abc123',
        updateDto,
      );
      expect(mockAgentsService.update).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when agent not found', async () => {
      const updateDto: UpdateAgentDto = { name: 'Updated Name' };
      mockAgentsService.update.mockRejectedValue(
        new NotFoundException('Agent agent-abc123 not found'),
      );

      await expect(
        controller.update('agent-abc123', updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove agent and return void', async () => {
      mockAgentsService.remove.mockResolvedValue(undefined);

      await controller.remove('agent-abc123');

      expect(mockAgentsService.remove).toHaveBeenCalledWith('agent-abc123');
      expect(mockAgentsService.remove).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when agent not found', async () => {
      mockAgentsService.remove.mockRejectedValue(
        new NotFoundException('Agent agent-abc123 not found'),
      );

      await expect(controller.remove('agent-abc123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
