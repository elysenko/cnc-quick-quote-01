import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Material } from '@prisma/client';
import { MaterialsService } from './materials.service';

@ApiTags('materials')
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  /** Active stock only — the customer dropdown never offers retired material. */
  @Get()
  list(): Promise<Material[]> {
    return this.materials.listActive();
  }
}
