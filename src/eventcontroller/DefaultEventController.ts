// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { UAParser } from 'ua-parser-js';

import AudioVideoController from '../audiovideocontroller/AudioVideoController';
import AudioVideoObserver from '../audiovideoobserver/AudioVideoObserver';
import Maybe from '../maybe/Maybe';
import Versioning from '../versioning/Versioning';
import AudioVideoEventAttributes from './AudioVideoEventAttributes';
import DeviceEventAttributes from './DeviceEventAttributes';
import EventAttributes from './EventAttributes';
import EventController from './EventController';
import EventName from './EventName';
import MeetingHistoryState from './MeetingHistoryState';

export default class DefaultEventController implements EventController {
  private static readonly UNAVAILABLE = 'Unavailable';

  // Use "ua-parser-js" over "detect-browser" to get more detailed information.
  // We can consider replacing "detect-browser" in DefaultBrowserBehavior.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parserResult: any;
  private browserMajorVersion: string;
  private meetingHistoryStates: { name: MeetingHistoryState; timestampMs: number }[] = [];

  constructor(private audioVideoController: AudioVideoController) {
    try {
      this.parserResult =
        navigator && navigator.userAgent ? new UAParser(navigator.userAgent).getResult() : null;
    } catch (error) {
      audioVideoController.logger.error(error.message);
    }

    this.browserMajorVersion =
      this.parserResult?.browser?.version?.split('.')[0] || DefaultEventController.UNAVAILABLE;
  }

  async publishEvent(
    name: EventName,
    attributes?: AudioVideoEventAttributes | DeviceEventAttributes
  ): Promise<void> {
    const timestampMs = Date.now();
    await this.pushMeetingState(name, timestampMs);
    this.audioVideoController.forEachObserver((observer: AudioVideoObserver) => {
      Maybe.of(observer.eventDidReceive).map(f =>
        f.bind(observer)(name, {
          ...this.getAttributes(timestampMs),
          ...attributes,
        })
      );
    });
  }

  async pushMeetingState(
    state: MeetingHistoryState,
    timestampMs: number = Date.now()
  ): Promise<void> {
    this.meetingHistoryStates.push({
      name: state,
      timestampMs,
    });
  }

  private getAttributes(timestampMs: number): EventAttributes {
    return {
      attendeeId: this.audioVideoController.configuration.credentials.attendeeId,
      browserMajorVersion: this.browserMajorVersion,
      browserName: this.parserResult?.browser.name || DefaultEventController.UNAVAILABLE,
      browserVersion: this.parserResult?.browser.version || DefaultEventController.UNAVAILABLE,
      deviceName:
        [this.parserResult?.device.vendor || '', this.parserResult?.device.model || '']
          .join(' ')
          .trim() || DefaultEventController.UNAVAILABLE,
      externalMeetingId:
        typeof this.audioVideoController.configuration.externalMeetingId === 'string'
          ? this.audioVideoController.configuration.externalMeetingId
          : '',
      externalUserId: this.audioVideoController.configuration.credentials.externalUserId,
      meetingHistory: this.meetingHistoryStates,
      meetingId: this.audioVideoController.configuration.meetingId,
      osName: this.parserResult?.os.name || DefaultEventController.UNAVAILABLE,
      osVersion: this.parserResult?.os.version || DefaultEventController.UNAVAILABLE,
      sdkVersion: Versioning.sdkVersion,
      sdkName: Versioning.sdkName,
      timestampMs,
    };
  }
}
