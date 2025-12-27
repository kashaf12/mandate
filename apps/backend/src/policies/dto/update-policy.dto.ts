import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePolicyDto } from './create-policy.dto';

export class UpdatePolicyDto extends PartialType(
  OmitType(CreatePolicyDto, ['name', 'createdBy'] as const),
) {}
