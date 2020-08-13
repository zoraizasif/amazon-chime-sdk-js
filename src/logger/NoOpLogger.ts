// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Logger from './Logger';
import LogLevel from './LogLevel';

/**
 * [[NoOpLogger]] does not log any message.
 */
export default class NoOpLogger implements Logger {
  recordStorage = {};

  level: LogLevel;

  constructor(level = LogLevel.OFF) {
    this.level = level;
  }

  info(_msg: string): void {}

  warn(_msg: string): void {}

  error(_msg: string): void {}

  record(
    name: string,
    attributes?: { [attributeName: string]: string | string [] },
    metrics?: { [metricsName: string]: number }
  ): void {}

  debug(debugFunction: () => string): void {
    if (LogLevel.DEBUG < this.level) {
      return;
    }
    debugFunction();
  }

  setLogLevel(level: LogLevel): void {
    this.level = level;
  }

  getLogLevel(): LogLevel {
    return this.level;
  }
}
