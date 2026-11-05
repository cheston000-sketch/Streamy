package org.streamy.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class SourcePageFailurePolicyTest {
    @Test public void recognizesObservedFailure() {
        assertTrue(SourcePageFailurePolicy.isVerificationFailure("Verification failed. Please reload"));
        assertTrue(SourcePageFailurePolicy.isVerificationFailure("VERIFICATION\nFAILED. Please\nreload"));
    }
    @Test public void doesNotTreatLoadingOrAnIncompleteMessageAsFailure() {
        assertFalse(SourcePageFailurePolicy.isVerificationFailure("Generating video stream"));
        assertFalse(SourcePageFailurePolicy.isVerificationFailure("Verification in progress. Please wait"));
        assertFalse(SourcePageFailurePolicy.isVerificationFailure("Verification failed"));
        assertFalse(SourcePageFailurePolicy.isVerificationFailure(null));
    }
}
