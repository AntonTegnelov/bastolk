import { ApiProperty } from '@nestjs/swagger';
import { VatTreatment } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';

export class DecideDto {
  @ApiProperty({
    example: '5420',
    description: "An account in this company's chart",
  })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'accountNumber must be four digits' })
  accountNumber!: string;

  @ApiProperty({ enum: VatTreatment })
  @IsEnum(VatTreatment)
  vatTreatment!: VatTreatment;
}
