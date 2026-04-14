import { NextResponse } from 'next/server';
import { HARLEY_STYLES } from '@/lib/harley/config';

export async function GET() {
  return NextResponse.json(
    HARLEY_STYLES.map(style => ({
      ...style,
      genericModels: style.generic_models,
    }))
  );
}
