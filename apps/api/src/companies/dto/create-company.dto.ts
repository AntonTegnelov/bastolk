import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Exempelbolaget AB' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    example: '556677-8899',
    description: 'Swedish organisation number',
  })
  @IsString()
  @Matches(/^\d{6}-\d{4}$/, { message: 'orgNumber must look like 556677-8899' })
  orgNumber!: string;
}
