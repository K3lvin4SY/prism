<?php

declare(strict_types=1);

namespace PrismSatisfactory\Support;

use RuntimeException;

/** The server's API turned the token or password down. */
final class UnauthorizedException extends RuntimeException {}
