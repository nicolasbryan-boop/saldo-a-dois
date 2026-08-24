/**
 * Application error taxonomy.
 *
 * Every error that reaches an HTTP boundary carries a stable machine code and
 * a message that is safe to show to a Brazilian end user. Internal detail is
 * kept out of the client response.
 */

export type AppErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'subscription_required'
  | 'member_limit_reached'
  | 'password_change_required'
  | 'onboarding_required'
  | 'not_configured'
  | 'internal';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  subscription_required: 402,
  member_limit_reached: 409,
  password_change_required: 403,
  onboarding_required: 409,
  not_configured: 503,
  internal: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const errors = {
  unauthenticated: (message = 'Você precisa entrar para continuar.') =>
    new AppError('unauthenticated', message),
  forbidden: (message = 'Você não tem acesso a estes dados.') =>
    new AppError('forbidden', message),
  notFound: (message = 'Não encontramos o que você procura.') =>
    new AppError('not_found', message),
  validation: (message = 'Confira os dados informados.', details?: Record<string, string[]>) =>
    new AppError('validation', message, details),
  conflict: (message = 'Essa operação conflita com o estado atual.') =>
    new AppError('conflict', message),
  rateLimited: (message = 'Muitas tentativas. Aguarde um instante e tente de novo.') =>
    new AppError('rate_limited', message),
  subscriptionRequired: (message = 'Sua assinatura precisa estar ativa para usar o app.') =>
    new AppError('subscription_required', message),
  memberLimitReached: (message = 'O plano Básico permite no máximo 2 pessoas no espaço.') =>
    new AppError('member_limit_reached', message),
  passwordChangeRequired: (message = 'Defina uma nova senha para continuar.') =>
    new AppError('password_change_required', message),
  onboardingRequired: (message = 'Termine a configuração inicial para continuar.') =>
    new AppError('onboarding_required', message),
  notConfigured: (message = 'Este recurso ainda não está configurado neste ambiente.') =>
    new AppError('not_configured', message),
  internal: (message = 'Algo deu errado do nosso lado. Tente novamente.') =>
    new AppError('internal', message),
};

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Message safe to surface to the user for any thrown value. */
export function toUserMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  return 'Algo deu errado do nosso lado. Tente novamente.';
}
